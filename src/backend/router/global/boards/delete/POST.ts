import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_SERVER_ERROR, respondError} from '@/backend/boards/http';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {loadView, writeFailure, writeView} from '@/backend/boards/owners';
import {ADMIN_PERMISSION, GUEST_LOGIN, canDelete, isVisibleTo} from '@/backend/boards/store';
import {deleteChanges} from '@/backend/boards/storage';

/**
 * @zod-to-schema
 */
export type BoardDeleteReq = {
  id: string;
};

/**
 * @zod-to-schema
 */
export type BoardDeleteRes = {
  ok: boolean;
};

function handle(ctx: CtxPost<BoardDeleteReq, BoardDeleteRes, never, 'global'>): void {
  const view = loadView(ctx.globalStorage, ctx.currentUser);
  const viewer = view.viewer;
  if (viewer.login === GUEST_LOGIN) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Log in to delete boards');
    return;
  }
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const {id} = ctx.request.json();
  const board = view.boards.find(b => b.id === id);
  // A board the user cannot see is reported as missing, so its existence is not revealed.
  if (!board || !isVisibleTo(board, viewer, projectAccessFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
    return;
  }
  if (!canDelete(board, viewer, isAdmin, projectAdminFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner, a system administrator or an admin of all its projects can delete this board');
    return;
  }
  const outcome = writeView(view, deleteChanges(view.snapshot, board.id, board.version + 1));
  if (!outcome.ok) {
    respondError(ctx.response, outcome.reason === 'full' ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR, writeFailure(outcome));
    return;
  }
  ctx.response.json({ok: true});
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
