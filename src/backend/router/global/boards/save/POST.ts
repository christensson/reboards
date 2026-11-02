import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {type BoardConfig, generateId, normalizeBoardConfig, validateBoardConfig} from '@/common/model/board-config';
import {projectAccessFor, projectAdminFor, projectUpdateFor} from '@/backend/boards/access';
import {HTTP_BAD_REQUEST, HTTP_CONFLICT, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_SERVER_ERROR, respondError} from '@/backend/boards/http';
import {type BoardView, loadView, writeFailure, writeView} from '@/backend/boards/owners';
import {
  ADMIN_PERMISSION,
  GUEST_LOGIN,
  MAX_BOARDS_PER_OWNER,
  canDelete,
  canEdit,
  canShare,
  isOwner,
  isVisibleTo,
  keepOmittedSettings,
  ownedBy,
  versionMatches
} from '@/backend/boards/store';
import {saveChanges} from '@/backend/boards/storage';

/**
 * @zod-to-schema
 */
export type BoardSaveReq = {
  board: BoardConfig;
  /** Version the edit started from; required for an existing board. A mismatch is rejected with 409 and the current board. */
  baseVersion?: number;
};

/**
 * @zod-to-schema
 */
export type BoardSaveRes = {
  board: BoardConfig;
  canEdit: boolean;
  canDelete: boolean;
};

/** The board with the settings an older widget left out kept from the stored one; null, after responding, when that is not valid. */
function withOmittedSettings(ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>, incoming: BoardConfig, raw: unknown, existing: BoardConfig): BoardConfig | null {
  const kept = keepOmittedSettings(incoming, raw, existing);
  const problems = kept === incoming ? [] : validateBoardConfig(kept);
  if (problems.length > 0) {
    respondError(ctx.response, HTTP_BAD_REQUEST, problems.map(p => p.message).join('; '));
    return null;
  }
  return kept;
}

/** A new board owned by the user; null, after responding, when they own too many already. */
function createdBoard(ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>, view: BoardView, incoming: BoardConfig, relatedBoards: string[]): BoardConfig | null {
  if (ownedBy(view.boards, view.viewer) >= MAX_BOARDS_PER_OWNER) {
    respondError(ctx.response, HTTP_BAD_REQUEST, `You can own at most ${MAX_BOARDS_PER_OWNER} boards. Delete one first`);
    return null;
  }
  const now = view.now;
  return {...incoming, relatedBoards, id: incoming.id || generateId(), owner: view.viewer.login, ownerId: view.viewer.id, createdAt: now, updatedAt: now, version: 1};
}

/**
 * The next version of a stored board; null, after responding, when the user may not change it or started
 * from an older version. The request body is passed in: it can be read only once.
 */
function updatedBoard(
  ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>,
  view: BoardView,
  body: BoardSaveReq,
  existing: BoardConfig,
  incoming: BoardConfig,
  relatedBoards: string[],
  isAdmin: boolean
): BoardConfig | null {
  const viewer = view.viewer;
  // Same response as delete: a board the user cannot see does not exist for them.
  if (!isVisibleTo(existing, viewer, projectAccessFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
    return null;
  }
  if (!canEdit(existing, viewer, isAdmin, projectAdminFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner, a system administrator or an admin of all its projects can change this board');
    return null;
  }
  if (!versionMatches(existing, body.baseVersion)) {
    respondError(ctx.response, HTTP_CONFLICT, 'The board was changed by someone else while you were editing', {current: existing});
    return null;
  }
  // The owner's save refreshes the stored login, which may have been renamed since.
  const owner = isOwner(existing, viewer) ? viewer.login : existing.owner;
  const kept = withOmittedSettings(ctx, incoming, body.board, existing);
  if (!kept) {
    return null;
  }
  return {...kept, relatedBoards, id: existing.id, owner, ownerId: existing.ownerId, createdAt: existing.createdAt, updatedAt: view.now, version: existing.version + 1};
}

/** Whether the board may be stored as shared; false, after responding, when a user without the rights shares it. */
function mayBecomeShared(ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>, view: BoardView, stored: BoardConfig, existing: BoardConfig | undefined, isAdmin: boolean): boolean {
  // Only sharing is checked: a board that is shared already stays shared, whoever edits it.
  if (!stored.shared || existing?.shared || canShare(stored, view.viewer, isAdmin, projectAdminFor(ctx.currentUser), projectUpdateFor(ctx.currentUser))) {
    return true;
  }
  respondError(ctx.response, HTTP_FORBIDDEN, 'To share this board you need to be able to update issues in all of its projects');
  return false;
}

function handle(ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>): void {
  const view = loadView(ctx.globalStorage, ctx.currentUser);
  const viewer = view.viewer;
  if (viewer.login === GUEST_LOGIN) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Log in to save boards');
    return;
  }
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const body = ctx.request.json();
  const incoming = normalizeBoardConfig(body.board, viewer.login);
  const problems = validateBoardConfig(incoming);
  if (problems.length > 0) {
    respondError(ctx.response, HTTP_BAD_REQUEST, problems.map(p => p.message).join('; '));
    return;
  }

  const isProjectAdmin = projectAdminFor(ctx.currentUser);
  const previous = incoming.id ? view.resolved.get(incoming.id) : undefined;
  // A deleted board stays deleted: a save of it is answered like one of a board that never existed.
  if (previous?.kind === 'deleted') {
    respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
    return;
  }
  const existing = previous?.kind === 'board' ? view.boards.find(b => b.id === incoming.id) : undefined;
  // Links to deleted boards are dropped; links to boards this user cannot see are kept for those who can.
  const relatedBoards = incoming.relatedBoards.filter(id => view.resolved.get(id)?.kind !== 'deleted');

  const stored = existing
    ? updatedBoard(ctx, view, body, existing, incoming, relatedBoards, isAdmin)
    : createdBoard(ctx, view, incoming, relatedBoards);
  if (!stored) {
    return;
  }

  if (!mayBecomeShared(ctx, view, stored, existing, isAdmin)) {
    return;
  }

  const outcome = writeView(view, saveChanges(stored, previous, view.owns(stored)));
  if (!outcome.ok) {
    respondError(ctx.response, outcome.reason === 'full' ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR, writeFailure(outcome));
    return;
  }
  ctx.response.json({
    board: stored,
    canEdit: canEdit(stored, viewer, isAdmin, isProjectAdmin),
    canDelete: canDelete(stored, viewer, isAdmin, isProjectAdmin)
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
