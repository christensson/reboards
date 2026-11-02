import {type BoardConfig, normalizeBoardConfig} from '@/common/model/board-config';

/**
 * Board persistence across many extension properties.
 *
 * YouTrack commits two transactions that write the same extension property as
 * "the later one wins", without an error, while writes to different properties
 * never interfere (measured, see README "Simultaneous writes"). So boards are
 * spread out instead of sharing one document:
 *
 * - shared boards (and private boards somebody else put there) live in two of
 *   32 slots on AppGlobalStorage, `boards00`…`boards31` (replicas);
 * - private boards live in their owner's `User.boards`;
 * - readers take the highest version of each board across all copies, so one
 *   overwritten copy loses nothing, and every write repairs the copies it touches.
 *
 * Every property holds the same {@link StoredBoards} document.
 */

/** Never change: every stored board would sit in the wrong slots. */
export const SLOT_COUNT = 32;

/** Upper bound of one stored property, in characters; a write that would exceed it is refused. */
export const MAX_PROPERTY_LENGTH = 250_000;

const DAY_MS = 86_400_000;

/** How long the copy left behind by a move stands in for a destination write that was lost. */
export const MOVE_FALLBACK_MS = DAY_MS;

/** How long a deleted board stays deleted against copies that other writes put back. */
export const TOMBSTONE_DAYS = 30;
export const TOMBSTONE_MS = TOMBSTONE_DAYS * DAY_MS;

/** Moves done on the side of one write (adopting private boards, redoing lost moves). */
export const MAX_REHOMES_PER_WRITE = 10;

/** The legacy single document's property, kept as a read-only backup after migration. */
export const LEGACY_KEY = 'boards';

/** The User property with the user's private boards. */
export const USER_KEY = 'boards';

/** A board as stored; `movedAt` marks the copy a move left at its source. */
export type StoredBoard = BoardConfig & {movedAt?: number};

export type Tombstone = {id: string; version: number; at: number};

export type StoredBoards = {
  version: 1;
  boards: StoredBoard[];
  deleted: Tombstone[];
};

/** Any entity with extension properties: AppGlobalStorage or a User. */
export type PropertyBag = {extensionProperties: Record<string, unknown>};

export type BoardStores = {
  global: PropertyBag;
  /** The current user, whose `boards` hold their private boards. */
  user: PropertyBag;
};

/** Where a copy is: a slot index, the current user's property, or the legacy document. */
export type Location = number | 'user' | 'legacy';

/** Where a board belongs: in its two slots or in its owner's property. */
export type Home = 'slots' | 'user';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SLOT_BITS = 5;

/** 32-bit FNV-1a over the UTF-16 code units. Never change: slots follow from it. */
export const fnv1a = (text: string): number => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
};

/** The two distinct slots that hold a board's replicas. */
export const slotsOf = (id: string): [number, number] => {
  const hash = fnv1a(id);
  const first = hash % SLOT_COUNT;
  const second = (first + 1 + ((hash >>> SLOT_BITS) % (SLOT_COUNT - 1))) % SLOT_COUNT;
  return [first, second];
};

export const slotKey = (slot: number): string => `boards${String(slot).padStart(2, '0')}`;

export const emptyStoredBoards = (): StoredBoards => ({version: 1, boards: [], deleted: []});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const parseTombstone = (value: unknown): Tombstone | null =>
  isRecord(value) && typeof value.id === 'string' && value.id && typeof value.version === 'number' && typeof value.at === 'number'
    ? {id: value.id, version: value.version, at: value.at}
    : null;

const parseBoard = (value: unknown): StoredBoard | null => {
  const board: StoredBoard = normalizeBoardConfig(value);
  if (!board.id) {
    return null;
  }
  if (isRecord(value) && typeof value.movedAt === 'number') {
    board.movedAt = value.movedAt;
  }
  return board;
};

/** Parses a stored property; an unset one is empty, a broken one is null (unreadable, never to be overwritten). */
export const parseStoredBoards = (raw: unknown): StoredBoards | null => {
  if (raw === null || raw === undefined || raw === '') {
    return emptyStoredBoards();
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (!isRecord(parsed) || !Array.isArray(parsed.boards)) {
      return null;
    }
    return {
      version: 1,
      boards: parsed.boards.map(parseBoard).filter((b): b is StoredBoard => b !== null),
      deleted: (Array.isArray(parsed.deleted) ? parsed.deleted : []).map(parseTombstone).filter((t): t is Tombstone => t !== null)
    };
  } catch {
    return null;
  }
};

export const serializeStoredBoards = (doc: StoredBoards): string => JSON.stringify(doc);

export type StorageSnapshot = {
  /** One per slot; null when the stored text does not parse. */
  slots: (StoredBoards | null)[];
  /** True once every slot holds a document: the legacy document has been migrated. */
  initialized: boolean;
  /** The current user's private boards; null when unreadable. */
  user: StoredBoards | null;
  /** Boards of the legacy document while it is not migrated yet. */
  legacy: BoardConfig[];
  /** The legacy document's parsed JSON, kept to write it back marked as migrated. */
  legacyRaw: Record<string, unknown> | null;
};

export const readSnapshot = (stores: BoardStores): StorageSnapshot => {
  const props = stores.global.extensionProperties;
  const raws = Array.from({length: SLOT_COUNT}, (_, slot) => props[slotKey(slot)]);
  const slots = raws.map((raw, slot) => {
    const doc = parseStoredBoards(raw);
    if (!doc) {
      console.error(`[reboards] Board slot ${slotKey(slot)} is unreadable; it will not be written`);
    }
    return doc;
  });
  const initialized = raws.every(raw => typeof raw === 'string' && raw !== '');
  const user = parseStoredBoards(stores.user.extensionProperties[USER_KEY]);
  if (!user) {
    console.error('[reboards] The current user\'s private boards are unreadable; they will not be written');
  }
  let legacy: BoardConfig[] = [];
  let legacyRaw: Record<string, unknown> | null = null;
  const legacyText = props[LEGACY_KEY];
  if (!initialized && typeof legacyText === 'string' && legacyText) {
    try {
      const parsed: unknown = JSON.parse(legacyText);
      if (isRecord(parsed) && Array.isArray(parsed.boards) && parsed.migratedAt === undefined) {
        legacyRaw = parsed;
        legacy = parsed.boards.map(b => normalizeBoardConfig(b)).filter(b => b.id);
      }
    } catch (error) {
      console.error('[reboards] The legacy board document is unreadable and is not migrated', error);
    }
  }
  return {slots, initialized, user, legacy, legacyRaw};
};

/** One copy of a board, or of its deletion, somewhere in storage. */
type Copy =
  | {kind: 'board'; board: StoredBoard; at: Location}
  | {kind: 'tombstone'; tombstone: Tombstone; at: Location};

const copyVersion = (copy: Copy): number => (copy.kind === 'board' ? copy.board.version : copy.tombstone.version);

/** Copies that still count: a move's fallback copy expires, and so does a tombstone. */
const isLive = (copy: Copy, now: number): boolean =>
  copy.kind === 'board'
    ? copy.board.movedAt === undefined || now - copy.board.movedAt < MOVE_FALLBACK_MS
    : now - copy.tombstone.at < TOMBSTONE_MS;

/** Where a board belongs, seen by the user who reads or writes it. */
export const homeOf = (board: BoardConfig, viewerOwns: boolean): Home => (!board.shared && viewerOwns ? 'user' : 'slots');

const locationHome = (at: Location): Home => (at === 'user' ? 'user' : 'slots');

/**
 * Orders two copies of one board; positive when `a` wins. Highest version first; at the same version a
 * deletion beats a board, a regular copy beats a move's fallback, then the later update and finally the
 * copy at the board's home wins.
 */
const compareCopies = (a: Copy, b: Copy, isOwnedByViewer: (board: BoardConfig) => boolean): number => {
  const byVersion = copyVersion(a) - copyVersion(b);
  if (byVersion !== 0) {
    return byVersion;
  }
  if (a.kind !== b.kind) {
    return a.kind === 'tombstone' ? 1 : -1;
  }
  if (a.kind === 'tombstone' || b.kind === 'tombstone') {
    return 0;
  }
  const aMoved = a.board.movedAt !== undefined;
  const bMoved = b.board.movedAt !== undefined;
  if (aMoved !== bMoved) {
    return aMoved ? -1 : 1;
  }
  if (a.board.updatedAt !== b.board.updatedAt) {
    return a.board.updatedAt - b.board.updatedAt;
  }
  const atHome = (copy: typeof a) => locationHome(copy.at) === homeOf(copy.board, isOwnedByViewer(copy.board));
  return Number(atHome(a)) - Number(atHome(b));
};

const copiesOf = (snapshot: StorageSnapshot): Map<string, Copy[]> => {
  const byId = new Map<string, Copy[]>();
  const add = (id: string, copy: Copy) => {
    const list = byId.get(id);
    if (list) {
      list.push(copy);
    } else {
      byId.set(id, [copy]);
    }
  };
  const addDoc = (doc: StoredBoards | null, at: Location) => {
    doc?.boards.forEach(board => add(board.id, {kind: 'board', board, at}));
    doc?.deleted.forEach(tombstone => add(tombstone.id, {kind: 'tombstone', tombstone, at}));
  };
  snapshot.slots.forEach((doc, slot) => addDoc(doc, slot));
  addDoc(snapshot.user, 'user');
  snapshot.legacy.forEach(board => add(board.id, {kind: 'board', board, at: 'legacy'}));
  return byId;
};

/** The current state of one board: the winning copy among all live copies. */
export type Resolved =
  | {kind: 'board'; board: StoredBoard; at: Location}
  | {kind: 'deleted'; version: number; at: Location};

const winnerOf = (copies: Copy[], now: number, isOwnedByViewer: (board: BoardConfig) => boolean): Copy | null =>
  copies.filter(copy => isLive(copy, now)).reduce<Copy | null>((best, copy) => (!best || compareCopies(copy, best, isOwnedByViewer) > 0 ? copy : best), null);

const toResolved = (copy: Copy): Resolved =>
  copy.kind === 'board' ? {kind: 'board', board: copy.board, at: copy.at} : {kind: 'deleted', version: copy.tombstone.version, at: copy.at};

/** Every board id the snapshot knows, with its current state. */
export const resolveAll = (snapshot: StorageSnapshot, now: number, isOwnedByViewer: (board: BoardConfig) => boolean): Map<string, Resolved> => {
  const resolved = new Map<string, Resolved>();
  copiesOf(snapshot).forEach((copies, id) => {
    const winner = winnerOf(copies, now, isOwnedByViewer);
    if (winner) {
      resolved.set(id, toResolved(winner));
    }
  });
  return resolved;
};

/** The boards that exist, without a move's `movedAt` marker. */
export const currentBoards = (resolved: Map<string, Resolved>): BoardConfig[] =>
  [...resolved.values()].flatMap(r => {
    if (r.kind !== 'board') {
      return [];
    }
    const {movedAt: _movedAt, ...board} = r.board;
    return [board];
  });

/** One change a write makes: a board, or its deletion, at its home; `fallback` marks a move's source copy. */
export type Change =
  | {id: string; to: Home; board: BoardConfig; fallback?: boolean}
  | {id: string; to: Home; deleted: {version: number}};

const locationsOf = (change: Change): Location[] => (change.to === 'user' ? ['user'] : slotsOf(change.id));

export type WritePlan =
  | {ok: true; global: Record<string, string>; user: string | null}
  | {ok: false; reason: 'unreadable' | 'full'; property: string};

const propertyName = (at: Location): string => {
  if (at === 'user') {
    return 'User.boards';
  }
  return at === 'legacy' ? LEGACY_KEY : slotKey(at);
};

/**
 * The documents a write stores. Every property it touches is first rebuilt from the winning copies (so a
 * copy another write reverted is repaired, and expired or superseded copies are dropped), then the changes
 * are applied. The first write after the upgrade also creates every slot and moves the legacy boards in.
 */
export const planWrite = (
  snapshot: StorageSnapshot,
  changes: Change[],
  now: number,
  isOwnedByViewer: (board: BoardConfig) => boolean
): WritePlan => {
  const touched = new Set<Location>(changes.flatMap(locationsOf));
  if (!snapshot.initialized) {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      touched.add(slot);
    }
  }
  const unreadable = [...touched].find(at => (at === 'user' ? !snapshot.user : at !== 'legacy' && !snapshot.slots[at]));
  if (unreadable !== undefined) {
    return {ok: false, reason: 'unreadable', property: propertyName(unreadable)};
  }

  const docs = new Map<Location, StoredBoards>();
  touched.forEach(at => docs.set(at, emptyStoredBoards()));
  copiesOf(snapshot).forEach((copies, id) => {
    const winner = winnerOf(copies, now, isOwnedByViewer);
    if (!winner) {
      return;
    }
    // A copy is kept where it belongs: in the board's slots, or in the user's property when it won there.
    const keepAt: Location[] = winner.at === 'user' ? ['user'] : slotsOf(id);
    keepAt.forEach(at => {
      const doc = docs.get(at);
      if (!doc) {
        return;
      }
      if (winner.kind === 'board') {
        doc.boards.push(winner.board);
      } else {
        doc.deleted.push(winner.tombstone);
      }
    });
  });

  changes.forEach(change => {
    locationsOf(change).forEach(at => {
      const doc = docs.get(at);
      if (!doc) {
        return;
      }
      doc.boards = doc.boards.filter(b => b.id !== change.id);
      doc.deleted = doc.deleted.filter(t => t.id !== change.id);
      if ('deleted' in change) {
        doc.deleted.push({id: change.id, version: change.deleted.version, at: now});
      } else {
        doc.boards.push(change.fallback ? {...change.board, movedAt: now} : {...change.board});
      }
    });
  });

  const global: Record<string, string> = {};
  let user: string | null = null;
  for (const [at, doc] of docs) {
    const text = serializeStoredBoards(doc);
    if (text.length > MAX_PROPERTY_LENGTH) {
      return {ok: false, reason: 'full', property: propertyName(at)};
    }
    if (at === 'user') {
      user = text;
    } else if (at !== 'legacy') {
      global[slotKey(at)] = text;
    }
  }
  if (!snapshot.initialized && snapshot.legacyRaw) {
    global[LEGACY_KEY] = JSON.stringify({...snapshot.legacyRaw, migratedAt: now});
  }
  return {ok: true, global, user};
};

export const commitWrite = (stores: BoardStores, plan: Extract<WritePlan, {ok: true}>): void => {
  Object.entries(plan.global).forEach(([key, text]) => {
    stores.global.extensionProperties[key] = text;
  });
  if (plan.user !== null) {
    stores.user.extensionProperties[USER_KEY] = plan.user;
  }
};

/**
 * Side moves a write also makes for the user: their private boards still in slots (put there by the
 * migration, a transfer or an admin unsharing) move to their property, and a move whose destination write
 * was lost (only its fallback copy is left) is done again. Each leaves a fallback copy at its source.
 */
export const rehomeChanges = (resolved: Map<string, Resolved>, isOwnedByViewer: (board: BoardConfig) => boolean, skip: Set<string>): Change[] => {
  const changes: Change[] = [];
  for (const [id, r] of resolved) {
    if (changes.length >= MAX_REHOMES_PER_WRITE * 2) {
      break;
    }
    if (r.kind !== 'board' || skip.has(id) || r.at === 'legacy') {
      continue;
    }
    const owned = isOwnedByViewer(r.board);
    const home = homeOf(r.board, owned);
    const lostMove = r.board.movedAt !== undefined;
    const misplaced = locationHome(r.at) !== home;
    // Only the owner's own boards and the copies in the user's own property are theirs to move.
    if (!(lostMove || misplaced) || !(owned || r.at === 'user')) {
      continue;
    }
    const {movedAt: _movedAt, ...board} = r.board;
    changes.push({id, to: home, board});
    if (misplaced) {
      changes.push({id, to: locationHome(r.at), board, fallback: true});
    }
  }
  return changes;
};

/** The change that moves or keeps a saved board at its home, with the fallback copy when its home changed. */
export const saveChanges = (board: BoardConfig, previous: Resolved | undefined, viewerOwns: boolean): Change[] => {
  const home = homeOf(board, viewerOwns);
  const changes: Change[] = [{id: board.id, to: home, board}];
  if (previous?.kind === 'board' && previous.at !== 'legacy' && locationHome(previous.at) !== home) {
    changes.push({id: board.id, to: locationHome(previous.at), board, fallback: true});
  }
  return changes;
};

/** Deletes a board wherever the user can write a copy of it: its slots, and their own property. */
export const deleteChanges = (snapshot: StorageSnapshot, id: string, version: number): Change[] => {
  const inUser = Boolean(snapshot.user?.boards.some(b => b.id === id) || snapshot.user?.deleted.some(t => t.id === id));
  const inSlots = slotsOf(id).some(slot => snapshot.slots[slot]?.boards.some(b => b.id === id)) || snapshot.legacy.some(b => b.id === id);
  const deleted = {version};
  return [
    ...(inSlots || !inUser ? [{id, to: 'slots' as const, deleted}] : []),
    ...(inUser ? [{id, to: 'user' as const, deleted}] : [])
  ];
};
