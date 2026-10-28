import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {HTTP_FORBIDDEN, HTTP_NOT_FOUND, respondError} from '@/backend/boards/http';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {ADMIN_PERMISSION, GUEST_LOGIN, canDelete, isVisibleTo, readBoards, writeBoards} from '@/backend/boards/store';

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
  const login = ctx.currentUser.login;
  if (login === GUEST_LOGIN) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Log in to delete boards');
    return;
  }
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const {id} = ctx.request.json();
  const doc = readBoards(ctx.globalStorage);
  const index = doc.boards.findIndex(b => b.id === id);
  // A board the user cannot see is reported as missing, so its existence is not revealed.
  if (index === -1 || !isVisibleTo(doc.boards[index], login, projectAccessFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
    return;
  }
  if (!canDelete(doc.boards[index], login, isAdmin, projectAdminFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner, a system administrator or an admin of all its projects can delete this board');
    return;
  }
  doc.boards.splice(index, 1);
  writeBoards(ctx.globalStorage, doc);
  ctx.response.json({ok: true});
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
