import {describe, expect, it} from 'vitest';
import {type BoardConfig, createEmptyBoard, generateId} from '@/common/model/board-config';
import {
  type BoardStores,
  type Change,
  LEGACY_KEY,
  MAX_PROPERTY_LENGTH,
  MOVE_FALLBACK_MS,
  SLOT_COUNT,
  USER_KEY,
  commitWrite,
  currentBoards,
  deleteChanges,
  emptyStoredBoards,
  fnv1a,
  parseStoredBoards,
  planWrite,
  readSnapshot,
  rehomeChanges,
  resolveAll,
  saveChanges,
  serializeStoredBoards,
  slotKey,
  slotsOf
} from './storage';

const NOW = 1_800_000_000_000;

const board = (id: string, owner: string, shared: boolean, version = 1): BoardConfig => ({
  ...createEmptyBoard(owner),
  id,
  name: id,
  owner,
  ownerId: `ring-${owner}`,
  shared,
  projects: [{id: 'p', shortName: 'SAN'}],
  version,
  updatedAt: version
});

const ownedBy = (login: string) => (b: BoardConfig) => b.ownerId === `ring-${login}`;

/** Fresh stores for one user; `global` is shared between users. */
const storesFor = (global: BoardStores['global'], user: BoardStores['user'] = {extensionProperties: {}}): BoardStores => ({global, user});

/** Reads, applies the changes plus the side moves, and commits, like a write handler does. */
const write = (stores: BoardStores, login: string, changes: (resolved: ReturnType<typeof resolveAll>, snapshot: ReturnType<typeof readSnapshot>) => Change[], now = NOW) => {
  const owns = ownedBy(login);
  const snapshot = readSnapshot(stores);
  const resolved = resolveAll(snapshot, now, owns);
  const main = changes(resolved, snapshot);
  const plan = planWrite(snapshot, [...rehomeChanges(resolved, owns, new Set(main.map(c => c.id))), ...main], now, owns);
  if (plan.ok) {
    commitWrite(stores, plan);
  }
  return plan;
};

const boardsSeen = (stores: BoardStores, login: string, now = NOW) => currentBoards(resolveAll(readSnapshot(stores), now, ownedBy(login)));

const slotDoc = (stores: BoardStores, slot: number) => parseStoredBoards(stores.global.extensionProperties[slotKey(slot)]);

const initialized = (): BoardStores['global'] => {
  const props: Record<string, unknown> = {};
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    props[slotKey(slot)] = serializeStoredBoards(emptyStoredBoards());
  }
  return {extensionProperties: props};
};

describe('slot hashing', () => {
  it('is stable FNV-1a', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
    expect(slotsOf('mh0k2x1qa8f3zc')).toEqual(slotsOf('mh0k2x1qa8f3zc'));
  });

  it('gives every id two distinct slots in range', () => {
    for (let i = 0; i < 2000; i++) {
      const [a, b] = slotsOf(generateId() + i);
      expect(a).not.toBe(b);
      [a, b].forEach(slot => {
        expect(Number.isInteger(slot)).toBe(true);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(SLOT_COUNT);
      });
    }
  });

  it('spreads generated ids evenly over the slots', () => {
    const counts = new Array(SLOT_COUNT).fill(0);
    for (let i = 0; i < 10_000; i++) {
      counts[slotsOf(generateId() + i)[0]]++;
    }
    counts.forEach(count => {
      expect(count).toBeGreaterThan(200);
      expect(count).toBeLessThan(430);
    });
  });

  it('names slots with two digits', () => {
    expect(slotKey(0)).toBe('boards00');
    expect(slotKey(31)).toBe('boards31');
  });
});

describe('parseStoredBoards', () => {
  it('reads unset as empty and broken as unreadable', () => {
    expect(parseStoredBoards(undefined)).toEqual(emptyStoredBoards());
    expect(parseStoredBoards('')).toEqual(emptyStoredBoards());
    expect(parseStoredBoards('{not json')).toBeNull();
    expect(parseStoredBoards('{"boards":"nope"}')).toBeNull();
  });

  it('keeps the move marker and drops boards without an id', () => {
    const doc = parseStoredBoards(JSON.stringify({version: 1, boards: [{name: 'x'}, {...board('a', 'al', true), movedAt: 5}], deleted: [{id: 'z', version: 2, at: 3}, {id: ''}]}));
    expect(doc?.boards.map(b => [b.id, b.movedAt])).toEqual([['a', 5]]);
    expect(doc?.deleted).toEqual([{id: 'z', version: 2, at: 3}]);
  });
});

describe('migration', () => {
  it('moves the legacy boards into both of their slots, creates every slot and marks the legacy document', () => {
    const legacy = {version: 1, boards: [board('s', 'alice', true), board('p', 'alice', false)]};
    const global = {extensionProperties: {[LEGACY_KEY]: JSON.stringify(legacy)} as Record<string, unknown>};
    const stores = storesFor(global);
    // Before any write, readers still see the legacy boards.
    expect(boardsSeen(stores, 'bob').map(b => b.id).sort()).toEqual(['p', 's']);

    expect(write(stores, 'bob', () => []).ok).toBe(true);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      expect(typeof global.extensionProperties[slotKey(slot)]).toBe('string');
    }
    ['s', 'p'].forEach(id => slotsOf(id).forEach(slot => expect(slotDoc(stores, slot)?.boards.map(b => b.id)).toContain(id)));
    expect(JSON.parse(String(global.extensionProperties[LEGACY_KEY]))).toMatchObject({migratedAt: NOW, boards: legacy.boards});
    // Bob writes nothing to his own property, and nothing is lost.
    expect(stores.user.extensionProperties[USER_KEY]).toBeUndefined();
    expect(boardsSeen(stores, 'bob').map(b => b.id).sort()).toEqual(['p', 's']);
    expect(readSnapshot(stores).legacy).toEqual([]);
  });

  it('lets the owner adopt a migrated private board on their next write', () => {
    const global = {extensionProperties: {[LEGACY_KEY]: JSON.stringify({version: 1, boards: [board('p', 'alice', false)]})} as Record<string, unknown>};
    write(storesFor(global), 'bob', () => []);
    const alice = storesFor(global);
    write(alice, 'alice', () => []);
    const mine = parseStoredBoards(alice.user.extensionProperties[USER_KEY]);
    expect(mine?.boards.map(b => [b.id, b.movedAt])).toEqual([['p', undefined]]);
    // The slots keep a fallback copy until the next write there sees the adopted one.
    slotsOf('p').forEach(slot => expect(slotDoc(alice, slot)?.boards[0].movedAt).toBe(NOW));
    // The adopted copy wins over the fallback copies, which go when a write next touches their slot.
    expect(resolveAll(readSnapshot(alice), NOW + 1, ownedBy('alice')).get('p')).toMatchObject({kind: 'board', at: 'user'});
    const [first] = slotsOf('p');
    const neighbour = Array.from({length: 500}, (_, i) => `n${i}`).find(id => slotsOf(id).includes(first)) ?? '';
    write(alice, 'alice', () => saveChanges(board(neighbour, 'alice', true), undefined, true), NOW + 1);
    expect(slotDoc(alice, first)?.boards.map(b => b.id)).toEqual([neighbour]);
    expect(boardsSeen(alice, 'alice', NOW + 1).map(b => b.id).sort()).toEqual([neighbour, 'p'].sort());
  });
});

describe('replicas', () => {
  it('keeps the newer copy when a stale write overwrites one replica, and repairs it on the next write', () => {
    const global = initialized();
    const stores = storesFor(global);
    write(stores, 'alice', () => saveChanges(board('s', 'alice', true, 2), undefined, true));
    const [first, second] = slotsOf('s');
    // A stale write puts version 1 back into one replica only.
    global.extensionProperties[slotKey(first)] = serializeStoredBoards({...emptyStoredBoards(), boards: [board('s', 'alice', true, 1)]});
    expect(boardsSeen(stores, 'bob')[0].version).toBe(2);
    expect(slotDoc(stores, second)?.boards[0].version).toBe(2);

    // Any write that touches the stale slot heals it.
    write(stores, 'bob', () => [{id: 'other', to: 'slots', board: {...board('other', 'bob', true), id: 'other'}}]);
    if (slotsOf('other').includes(first)) {
      expect(slotDoc(stores, first)?.boards.find(b => b.id === 's')?.version).toBe(2);
    }
    write(stores, 'alice', () => saveChanges(board('s', 'alice', true, 3), undefined, true));
    expect(slotDoc(stores, first)?.boards.find(b => b.id === 's')?.version).toBe(3);
  });

  it('keeps a deleted board deleted when a stale write puts it back into one replica', () => {
    const global = initialized();
    const stores = storesFor(global);
    write(stores, 'alice', () => saveChanges(board('s', 'alice', true, 2), undefined, true));
    write(stores, 'alice', (_r, snapshot) => deleteChanges(snapshot, 's', 3));
    expect(boardsSeen(stores, 'alice')).toEqual([]);
    const [first] = slotsOf('s');
    global.extensionProperties[slotKey(first)] = serializeStoredBoards({...emptyStoredBoards(), boards: [board('s', 'alice', true, 2)]});
    expect(boardsSeen(stores, 'alice')).toEqual([]);
    expect(resolveAll(readSnapshot(stores), NOW, ownedBy('alice')).get('s')?.kind).toBe('deleted');
  });
});

describe('private boards and moves', () => {
  it('stores private boards in the owner\'s property only', () => {
    const global = initialized();
    const alice = storesFor(global);
    write(alice, 'alice', () => saveChanges(board('p', 'alice', false), undefined, true));
    expect(parseStoredBoards(alice.user.extensionProperties[USER_KEY])?.boards.map(b => b.id)).toEqual(['p']);
    slotsOf('p').forEach(slot => expect(slotDoc(alice, slot)?.boards).toEqual([]));
    expect(boardsSeen(storesFor(global), 'bob')).toEqual([]);
  });

  it('shares by moving into the slots and leaves a fallback copy that survives a lost slot write', () => {
    const global = initialized();
    const alice = storesFor(global);
    write(alice, 'alice', () => saveChanges(board('p', 'alice', false, 1), undefined, true));
    const previous = resolveAll(readSnapshot(alice), NOW, ownedBy('alice')).get('p');
    write(alice, 'alice', () => saveChanges(board('p', 'alice', true, 2), previous, true));
    expect(parseStoredBoards(alice.user.extensionProperties[USER_KEY])?.boards.map(b => [b.id, b.version, b.movedAt])).toEqual([['p', 2, NOW]]);
    expect(boardsSeen(storesFor(global), 'bob').map(b => [b.id, b.version])).toEqual([['p', 2]]);

    // Both slot writes are reverted by stale writes: the fallback copy still holds the board.
    slotsOf('p').forEach(slot => {
      global.extensionProperties[slotKey(slot)] = serializeStoredBoards(emptyStoredBoards());
    });
    expect(boardsSeen(alice, 'alice').map(b => [b.id, b.version, b.shared])).toEqual([['p', 2, true]]);
    // Alice's next write redoes the move.
    write(alice, 'alice', () => [], NOW + 1);
    expect(boardsSeen(storesFor(global), 'bob', NOW + 1).map(b => b.id)).toEqual(['p']);
  });

  it('lets a fallback copy expire', () => {
    const global = initialized();
    const alice = storesFor(global);
    alice.user.extensionProperties[USER_KEY] = serializeStoredBoards({...emptyStoredBoards(), boards: [{...board('p', 'alice', true), movedAt: NOW}]});
    expect(boardsSeen(alice, 'alice', NOW + MOVE_FALLBACK_MS - 1).map(b => b.id)).toEqual(['p']);
    expect(boardsSeen(alice, 'alice', NOW + MOVE_FALLBACK_MS)).toEqual([]);
  });

  it('keeps a board unshared by an admin in its slots until the owner takes it back', () => {
    const global = initialized();
    const alice = storesFor(global);
    write(alice, 'alice', () => saveChanges(board('s', 'alice', true, 1), undefined, true));
    const admin = storesFor(global);
    const previous = resolveAll(readSnapshot(admin), NOW, ownedBy('admin')).get('s');
    expect(saveChanges(board('s', 'alice', false, 2), previous, false)).toEqual([{id: 's', to: 'slots', board: board('s', 'alice', false, 2)}]);
    write(admin, 'admin', () => saveChanges(board('s', 'alice', false, 2), previous, false));
    expect(boardsSeen(alice, 'alice').map(b => [b.id, b.shared])).toEqual([['s', false]]);
    write(alice, 'alice', () => [], NOW + 1);
    expect(parseStoredBoards(alice.user.extensionProperties[USER_KEY])?.boards.map(b => b.id)).toEqual(['s']);
  });

  it('deletes everywhere the user can write a copy', () => {
    const global = initialized();
    const alice = storesFor(global);
    alice.user.extensionProperties[USER_KEY] = serializeStoredBoards({...emptyStoredBoards(), boards: [{...board('p', 'alice', true), movedAt: NOW}]});
    const [first] = slotsOf('p');
    global.extensionProperties[slotKey(first)] = serializeStoredBoards({...emptyStoredBoards(), boards: [board('p', 'alice', true)]});
    const changes = deleteChanges(readSnapshot(alice), 'p', 2);
    expect(changes.map(c => c.to)).toEqual(['slots', 'user']);
    write(alice, 'alice', () => changes);
    expect(boardsSeen(alice, 'alice')).toEqual([]);
  });
});

describe('refused writes', () => {
  it('never overwrites an unreadable slot', () => {
    const global = initialized();
    const [first] = slotsOf('s');
    global.extensionProperties[slotKey(first)] = '{broken';
    const plan = write(storesFor(global), 'alice', () => saveChanges(board('s', 'alice', true), undefined, true));
    expect(plan).toEqual({ok: false, reason: 'unreadable', property: slotKey(first)});
    expect(global.extensionProperties[slotKey(first)]).toBe('{broken');
  });

  it('refuses a write that would make a property too long', () => {
    const big = {...board('s', 'alice', true), name: 'x'.repeat(MAX_PROPERTY_LENGTH)};
    const plan = write(storesFor(initialized()), 'alice', () => saveChanges(big, undefined, true));
    expect(plan.ok).toBe(false);
  });
});
