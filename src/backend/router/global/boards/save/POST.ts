import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {type BoardConfig, generateId, normalizeBoardConfig, validateBoardConfig} from '@/common/model/board-config';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {HTTP_BAD_REQUEST, HTTP_CONFLICT, HTTP_FORBIDDEN, HTTP_NOT_FOUND, respondError} from '@/backend/boards/http';
import {ADMIN_PERMISSION, GUEST_LOGIN, canDelete, canEdit, canShare, isVisibleTo, readBoards, writeBoards} from '@/backend/boards/store';

/**
 * @zod-to-schema
 */
export type BoardSaveReq = {
  board: BoardConfig;
  /** updatedAt the client last saw; a mismatch is rejected with 409. */
  expectedUpdatedAt?: number;
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
  const login = ctx.currentUser.login;
  if (login === GUEST_LOGIN) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Log in to save boards');
    return;
  }
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const body = ctx.request.json();
  const incoming = normalizeBoardConfig(body.board, login);
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

  const doc = readBoards(ctx.globalStorage);
  const now = Date.now();
  const existingIndex = incoming.id ? doc.boards.findIndex(b => b.id === incoming.id) : -1;

  let stored: BoardConfig;
  if (existingIndex === -1) {
    stored = {...incoming, id: incoming.id || generateId(), owner: login, createdAt: now, updatedAt: now};
    doc.boards.push(stored);
  } else {
    const existing = doc.boards[existingIndex];
    // Same response as delete: a board the user cannot see does not exist for them.
    if (!isVisibleTo(existing, login, projectAccessFor(ctx.currentUser))) {
      respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
      return;
    }
    if (!canEdit(existing, login, isAdmin)) {
      respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner or a system administrator can change this board');
      return;
    }
    if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== existing.updatedAt) {
      respondError(ctx.response, HTTP_CONFLICT, 'The board was changed by someone else. Reload and try again');
      return;
    }
    stored = {...incoming, id: existing.id, owner: existing.owner, createdAt: existing.createdAt, updatedAt: now};
    doc.boards[existingIndex] = stored;
  }

  writeBoards(ctx.globalStorage, doc);
  ctx.response.json({
    board: stored,
    canEdit: canEdit(stored, login, isAdmin),
    canDelete: canDelete(stored, login, isAdmin, isProjectAdmin)
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
