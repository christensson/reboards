import * as entities from '@jetbrains/youtrack-scripting-api/entities';
import type {User} from '@jetbrains/youtrack-scripting-api/entities';
import {type BoardsDocument, GUEST_LOGIN, type GlobalStorageLike, type Viewer, readBoards} from './store';

export const viewerOf = (user: User): Viewer => ({login: user.login, id: user.ringId});

/** Finds an active user by login; null for unknown, banned or guest users. */
export const findActiveUser = (login: string): User | null => {
  try {
    const user = entities.User.findByLogin(login);
    return user && !user.isBanned && user.login !== GUEST_LOGIN ? user : null;
  } catch {
    return null;
  }
};

/**
 * Reads the boards and fills in the owner id of boards stored before it was
 * recorded, resolving it from the owner's login. The next write persists it.
 */
export const loadBoards = (storage: GlobalStorageLike): BoardsDocument => {
  const doc = readBoards(storage);
  doc.boards.forEach(board => {
    if (!board.ownerId && board.owner) {
      const user = findActiveUser(board.owner);
      if (user) {
        board.ownerId = user.ringId;
      }
    }
  });
  return doc;
};
