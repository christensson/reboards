import {type BoardConfig, type ProjectRef, normalizeBoardConfig} from '@/common/model/board-config';

/** Permission key that grants edit rights on every shared board. */
export const ADMIN_PERMISSION = 'ADMIN_UPDATE_APP';

export type BoardsDocument = {
  version: 1;
  boards: BoardConfig[];
};

export type GlobalStorageLike = {
  extensionProperties: {boards?: string | null};
};

export const parseBoardsDocument = (raw: string | null | undefined): BoardsDocument => {
  if (!raw) {
    return {version: 1, boards: []};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const boards = Array.isArray((parsed as {boards?: unknown}).boards) ? (parsed as {boards: unknown[]}).boards : [];
    return {version: 1, boards: boards.map(b => normalizeBoardConfig(b)).filter(b => b.id)};
  } catch (error) {
    console.error('[reboards] Could not parse stored boards, starting empty', error);
    return {version: 1, boards: []};
  }
};

export const serializeBoardsDocument = (doc: BoardsDocument): string => JSON.stringify(doc);

export const readBoards = (storage: GlobalStorageLike): BoardsDocument =>
  parseBoardsDocument(storage.extensionProperties.boards);

export const writeBoards = (storage: GlobalStorageLike, doc: BoardsDocument): void => {
  storage.extensionProperties.boards = serializeBoardsDocument(doc);
};

/** Whether the current user can read issues in a project. */
export type ProjectAccess = (project: ProjectRef) => boolean;

/** The user a request is made for: login for display, id (stable) for ownership. */
export type Viewer = {
  login: string;
  id: string;
};

/** Ownership follows the stable id; boards stored before ids were recorded fall back to the login. */
export const isOwner = (board: BoardConfig, viewer: Viewer): boolean =>
  board.ownerId ? board.ownerId === viewer.id : board.owner === viewer.login;

/**
 * Owners always see their boards. Others see a shared board only when they can
 * read every one of its projects, so its settings never reveal a hidden project.
 */
export const isVisibleTo = (board: BoardConfig, viewer: Viewer, canReadProject: ProjectAccess): boolean =>
  isOwner(board, viewer) || (board.shared && board.projects.every(canReadProject));

export const canEdit = (board: BoardConfig, viewer: Viewer, isAdmin: boolean): boolean =>
  isOwner(board, viewer) || (board.shared && isAdmin);

const adminOfAll = (board: BoardConfig, isProjectAdmin: ProjectAccess): boolean =>
  board.projects.length > 0 && board.projects.every(isProjectAdmin);

/** Project admins may also delete shared boards whose projects they all administer. */
export const canDelete = (board: BoardConfig, viewer: Viewer, isAdmin: boolean, isProjectAdmin: ProjectAccess): boolean =>
  canEdit(board, viewer, isAdmin) || (board.shared && adminOfAll(board, isProjectAdmin));

/** Whoever may delete a board may also hand it over to another user. */
export const canTransfer = canDelete;

/** Only system admins and admins of every project of a board may share it. */
export const canShare = (board: BoardConfig, isAdmin: boolean, isProjectAdmin: ProjectAccess): boolean =>
  isAdmin || adminOfAll(board, isProjectAdmin);

export const visibleBoards = (doc: BoardsDocument, viewer: Viewer, canReadProject: ProjectAccess): BoardConfig[] =>
  doc.boards.filter(b => isVisibleTo(b, viewer, canReadProject));

/** Boards one user may own, so nobody can fill the shared document on their own. */
export const MAX_BOARDS_PER_OWNER = 100;

/** Upper bound of the stored document, in characters; saves that would exceed it are rejected. */
export const MAX_DOCUMENT_LENGTH = 4_000_000;

export const ownedBy = (doc: BoardsDocument, viewer: Viewer): number => doc.boards.filter(b => isOwner(b, viewer)).length;

/** Login of the anonymous user; every visitor shares it, so it must not own boards. */
export const GUEST_LOGIN = 'guest';
