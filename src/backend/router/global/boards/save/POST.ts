import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {type BoardConfig, generateId, normalizeBoardConfig, validateBoardConfig} from '@/common/model/board-config';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {HTTP_BAD_REQUEST, HTTP_CONFLICT, HTTP_FORBIDDEN, HTTP_NOT_FOUND, respondError} from '@/backend/boards/http';
import {loadBoards, viewerOf} from '@/backend/boards/owners';
import {
  ADMIN_PERMISSION,
  GUEST_LOGIN,
  MAX_BOARDS_PER_OWNER,
  MAX_DOCUMENT_LENGTH,
  canDelete,
  canEdit,
  canShare,
  isOwner,
  isVisibleTo,
  ownedBy,
  serializeBoardsDocument,
  versionMatches,
  writeBoards
} from '@/backend/boards/store';

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

function handle(ctx: CtxPost<BoardSaveReq, BoardSaveRes, never, 'global'>): void {
  const viewer = viewerOf(ctx.currentUser);
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
  if (incoming.shared && !canShare(incoming, isAdmin, isProjectAdmin)) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Only admins of all the board\'s projects can share it');
    return;
  }

  const doc = loadBoards(ctx.globalStorage);
  const now = Date.now();
  const existingIndex = incoming.id ? doc.boards.findIndex(b => b.id === incoming.id) : -1;

  let stored: BoardConfig;
  if (existingIndex === -1) {
    if (ownedBy(doc, viewer) >= MAX_BOARDS_PER_OWNER) {
      respondError(ctx.response, HTTP_BAD_REQUEST, `You can own at most ${MAX_BOARDS_PER_OWNER} boards. Delete one first`);
      return;
    }
    stored = {...incoming, id: incoming.id || generateId(), owner: viewer.login, ownerId: viewer.id, createdAt: now, updatedAt: now, version: 1};
    doc.boards.push(stored);
  } else {
    const existing = doc.boards[existingIndex];
    // Same response as delete: a board the user cannot see does not exist for them.
    if (!isVisibleTo(existing, viewer, projectAccessFor(ctx.currentUser))) {
      respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
      return;
    }
    if (!canEdit(existing, viewer, isAdmin)) {
      respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner or a system administrator can change this board');
      return;
    }
    if (!versionMatches(existing, body.baseVersion)) {
      respondError(ctx.response, HTTP_CONFLICT, 'The board was changed by someone else while you were editing', {current: existing});
      return;
    }
    // The owner's save refreshes the stored login, which may have been renamed since.
    const owner = isOwner(existing, viewer) ? viewer.login : existing.owner;
    stored = {...incoming, id: existing.id, owner, ownerId: existing.ownerId, createdAt: existing.createdAt, updatedAt: now, version: existing.version + 1};
    doc.boards[existingIndex] = stored;
  }

  if (serializeBoardsDocument(doc).length > MAX_DOCUMENT_LENGTH) {
    respondError(ctx.response, HTTP_BAD_REQUEST, 'The board storage is full. Delete unused boards first');
    return;
  }
  writeBoards(ctx.globalStorage, doc);
  ctx.response.json({
    board: stored,
    canEdit: canEdit(stored, viewer, isAdmin),
    canDelete: canDelete(stored, viewer, isAdmin, isProjectAdmin)
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
