import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import type {BoardConfig} from '@/common/model/board-config';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {HTTP_BAD_REQUEST, HTTP_FORBIDDEN, HTTP_NOT_FOUND, HTTP_SERVER_ERROR, respondError} from '@/backend/boards/http';
import {findActiveUser, loadView, writeFailure, writeView} from '@/backend/boards/owners';
import {ADMIN_PERMISSION, GUEST_LOGIN, canDelete, canEdit, canTransfer, isOwner, isVisibleTo} from '@/backend/boards/store';
import {saveChanges} from '@/backend/boards/storage';

/**
 * @zod-to-schema
 */
export type BoardOwnerReq = {
  id: string;
  /** Login of the new owner. */
  login: string;
};

/**
 * @zod-to-schema
 */
export type BoardOwnerRes = {
  board: BoardConfig;
  /** False when the board is personal and the current user no longer owns it. */
  visible: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function handle(ctx: CtxPost<BoardOwnerReq, BoardOwnerRes, never, 'global'>): void {
  const view = loadView(ctx.globalStorage, ctx.currentUser);
  const viewer = view.viewer;
  if (viewer.login === GUEST_LOGIN) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Log in to change board owners');
    return;
  }
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const isProjectAdmin = projectAdminFor(ctx.currentUser);
  const {id, login} = ctx.request.json();
  const board = view.boards.find(b => b.id === id);
  // A board the user cannot see is reported as missing, so its existence is not revealed.
  if (!board || !isVisibleTo(board, viewer, projectAccessFor(ctx.currentUser))) {
    respondError(ctx.response, HTTP_NOT_FOUND, 'Board not found');
    return;
  }
  if (!canTransfer(board, viewer, isAdmin, isProjectAdmin)) {
    respondError(ctx.response, HTTP_FORBIDDEN, 'Only the board owner, a system administrator or an admin of all its projects can change the owner');
    return;
  }
  const target = typeof login === 'string' ? findActiveUser(login) : null;
  if (!target) {
    respondError(ctx.response, HTTP_BAD_REQUEST, `No active user with login "${String(login)}"`);
    return;
  }
  // The new owner must be able to use the board they get.
  if (!board.projects.every(projectAccessFor(target))) {
    respondError(ctx.response, HTTP_BAD_REQUEST, `${target.login} cannot read all of this board's projects`);
    return;
  }

  const stored = {...board, owner: target.login, ownerId: target.ringId, updatedAt: view.now, version: board.version + 1};
  // A private board handed over waits in its slots until the new owner's next write takes it in.
  const outcome = writeView(view, saveChanges(stored, view.resolved.get(board.id), isOwner(stored, viewer)));
  if (!outcome.ok) {
    respondError(ctx.response, outcome.reason === 'full' ? HTTP_BAD_REQUEST : HTTP_SERVER_ERROR, writeFailure(outcome));
    return;
  }
  ctx.response.json({
    board: stored,
    visible: isVisibleTo(stored, viewer, projectAccessFor(ctx.currentUser)),
    canEdit: canEdit(stored, viewer, isAdmin, isProjectAdmin),
    canDelete: canDelete(stored, viewer, isAdmin, isProjectAdmin)
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
