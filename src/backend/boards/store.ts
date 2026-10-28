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

/**
 * Owners always see their boards. Others see a shared board only when they can
 * read every one of its projects, so its settings never reveal a hidden project.
 */
export const isVisibleTo = (board: BoardConfig, login: string, canReadProject: ProjectAccess): boolean =>
  board.owner === login || (board.shared && board.projects.every(canReadProject));

export const canEdit = (board: BoardConfig, login: string, isAdmin: boolean): boolean =>
  board.owner === login || (board.shared && isAdmin);

export const visibleBoards = (doc: BoardsDocument, login: string, canReadProject: ProjectAccess): BoardConfig[] =>
  doc.boards.filter(b => isVisibleTo(b, login, canReadProject));
