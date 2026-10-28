import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import type {BoardConfig} from '@/common/model/board-config';
import {projectAccessFor, projectAdminFor} from '@/backend/boards/access';
import {ADMIN_PERMISSION, canDelete, canEdit, readBoards, visibleBoards} from '@/backend/boards/store';

/**
 * @zod-to-schema
 */
export type CurrentUserInfo = {
  login: string;
  isAdmin: boolean;
};

/**
 * @zod-to-schema
 */
export type BoardsListRes = {
  boards: BoardConfig[];
  /** Ids of the boards the current user may change or delete. */
  editableIds: string[];
  /** Ids of the boards the current user may delete. */
  deletableIds: string[];
  me: CurrentUserInfo;
};

function handle(ctx: CtxGet<BoardsListRes, never, 'global'>): void {
  const login = ctx.currentUser.login;
  const isAdmin = ctx.currentUser.hasPermission(ADMIN_PERMISSION);
  const isProjectAdmin = projectAdminFor(ctx.currentUser);
  const boards = visibleBoards(readBoards(ctx.globalStorage), login, projectAccessFor(ctx.currentUser));
  ctx.response.json({
    boards,
    editableIds: boards.filter(board => canEdit(board, login, isAdmin)).map(board => board.id),
    deletableIds: boards.filter(board => canDelete(board, login, isAdmin, isProjectAdmin)).map(board => board.id),
    me: {login, isAdmin}
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
