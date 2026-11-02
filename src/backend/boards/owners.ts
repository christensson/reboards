import * as entities from '@jetbrains/youtrack-scripting-api/entities';
import type {User} from '@jetbrains/youtrack-scripting-api/entities';
import type {BoardConfig} from '@/common/model/board-config';
import {GUEST_LOGIN, type Viewer, isOwner} from './store';
import {
  type BoardStores,
  type Change,
  type PropertyBag,
  type Resolved,
  type StorageSnapshot,
  commitWrite,
  currentBoards,
  planWrite,
  readSnapshot,
  rehomeChanges,
  resolveAll
} from './storage';

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

/** All stored boards as the current user sees storage: before the visibility filter. */
export type BoardView = {
  stores: BoardStores;
  snapshot: StorageSnapshot;
  resolved: Map<string, Resolved>;
  boards: BoardConfig[];
  viewer: Viewer;
  owns: (board: BoardConfig) => boolean;
  now: number;
};

/**
 * Reads every slot and the current user's private boards, and fills in the owner id of boards stored
 * before it was recorded, resolving it from the owner's login. The next write of a board persists it.
 */
export const loadView = (globalStorage: {extensionProperties: unknown}, user: User, now = Date.now()): BoardView => {
  const stores: BoardStores = {global: globalStorage as PropertyBag, user: user as unknown as PropertyBag};
  const viewer = viewerOf(user);
  const owns = (board: BoardConfig) => isOwner(board, viewer);
  const snapshot = readSnapshot(stores);
  const resolved = resolveAll(snapshot, now, owns);
  resolved.forEach(r => {
    if (r.kind === 'board' && !r.board.ownerId && r.board.owner) {
      const owner = findActiveUser(r.board.owner);
      if (owner) {
        r.board.ownerId = owner.ringId;
      }
    }
  });
  return {stores, snapshot, resolved, boards: currentBoards(resolved), viewer, owns, now};
};

export type WriteOutcome = {ok: true} | {ok: false; reason: 'unreadable' | 'full'; property: string};

/** Stores the changes, plus the side moves of the user's misplaced boards (see `rehomeChanges`). */
export const writeView = (view: BoardView, changes: Change[]): WriteOutcome => {
  const skip = new Set(changes.map(change => change.id));
  const plan = planWrite(view.snapshot, [...rehomeChanges(view.resolved, view.owns, skip), ...changes], view.now, view.owns);
  if (!plan.ok) {
    console.error(`[reboards] Board write refused: ${plan.reason} ${plan.property}`);
    return plan;
  }
  commitWrite(view.stores, plan);
  return {ok: true};
};

/** The message for a refused write. */
export const writeFailure = (outcome: Extract<WriteOutcome, {ok: false}>): string =>
  outcome.reason === 'full'
    ? 'The board storage is full. Delete unused boards first'
    : `Stored boards (${outcome.property}) could not be read, so nothing was saved. Ask an administrator to check the app's storage`;
