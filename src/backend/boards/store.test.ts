import {describe, expect, it} from 'vitest';
import {createEmptyBoard} from '@/common/model/board-config';
import {canDelete, canEdit, canShare, isOwner, parseBoardsDocument, versionMatches, readBoards, serializeBoardsDocument, visibleBoards, writeBoards} from './store';

const board = (id: string, owner: string, shared: boolean, projects = ['SAN']) => ({
  ...createEmptyBoard(owner),
  id,
  name: id,
  shared,
  projects: projects.map(shortName => ({id: `id-${shortName}`, shortName}))
});

const readsAll = () => true;

/** A viewer with a stable id derived from the login. */
const as = (login: string) => ({login, id: `ring-${login}`});

describe('boards store', () => {
  it('parses empty and invalid storage into an empty document', () => {
    expect(parseBoardsDocument(null).boards).toEqual([]);
    expect(parseBoardsDocument('').boards).toEqual([]);
    expect(parseBoardsDocument('{not json').boards).toEqual([]);
    expect(parseBoardsDocument('{"boards":"nope"}').boards).toEqual([]);
  });

  it('drops boards without an id and normalizes the rest', () => {
    const doc = parseBoardsDocument(JSON.stringify({boards: [{name: 'no id'}, {id: 'a', name: 'A', owner: 'x'}]}));
    expect(doc.boards.map(b => b.id)).toEqual(['a']);
    expect(doc.boards[0].columnField.name).toBe('State');
  });

  it('round-trips through a storage object', () => {
    const storage = {extensionProperties: {boards: null as string | null}};
    writeBoards(storage, {version: 1, boards: [board('a', 'alice', true)]});
    expect(readBoards(storage).boards[0].id).toBe('a');
    expect(serializeBoardsDocument(readBoards(storage))).toBe(storage.extensionProperties.boards);
  });

  it('hides personal boards from other users', () => {
    const doc = {version: 1 as const, boards: [board('s', 'alice', true), board('p', 'alice', false), board('q', 'bob', false)]};
    expect(visibleBoards(doc, as('bob'), readsAll).map(b => b.id)).toEqual(['s', 'q']);
    expect(visibleBoards(doc, as('alice'), readsAll).map(b => b.id)).toEqual(['s', 'p']);
  });

  it('hides shared boards with a project the user cannot read', () => {
    const doc = {version: 1 as const, boards: [board('open', 'alice', true, ['SAN']), board('mixed', 'alice', true, ['SAN', 'SP'])]};
    const readsSan = (p: {shortName: string}) => p.shortName === 'SAN';
    expect(visibleBoards(doc, as('bob'), readsSan).map(b => b.id)).toEqual(['open']);
  });

  it('always shows owners their own boards', () => {
    const doc = {version: 1 as const, boards: [board('s', 'alice', true, ['SP']), board('p', 'alice', false, ['SP'])]};
    expect(visibleBoards(doc, as('alice'), () => false).map(b => b.id)).toEqual(['s', 'p']);
  });

  it('lets owners, system admins and admins of every project of a shared board edit and delete it', () => {
    const none = () => false;
    const adminOfSan = (p: {shortName: string}) => p.shortName === 'SAN';
    expect(canEdit(board('s', 'alice', true), as('alice'), false, none)).toBe(true);
    expect(canEdit(board('s', 'alice', true), as('bob'), false, none)).toBe(false);
    expect(canEdit(board('s', 'alice', true), as('bob'), true, none)).toBe(true);
    expect(canEdit(board('p', 'alice', false), as('bob'), true, none)).toBe(false);
    expect(canEdit(board('s', 'alice', true, ['SAN']), as('bob'), false, adminOfSan)).toBe(true);
    expect(canEdit(board('m', 'alice', true, ['SAN', 'SP']), as('bob'), false, adminOfSan)).toBe(false);
    expect(canEdit(board('p', 'alice', false, ['SAN']), as('bob'), false, adminOfSan)).toBe(false);
    expect(canDelete).toBe(canEdit);
  });

  it('lets only system admins and admins of every board project share', () => {
    const adminOfSan = (p: {shortName: string}) => p.shortName === 'SAN';
    expect(canShare(board('s', 'bob', true, ['SAN']), false, adminOfSan)).toBe(true);
    expect(canShare(board('m', 'bob', true, ['SAN', 'SP']), false, adminOfSan)).toBe(false);
    expect(canShare(board('m', 'bob', true, ['SAN', 'SP']), true, () => false)).toBe(true);
  });

  it('matches owners by stable id, falling back to the login for old boards', () => {
    const recorded = {...board('s', 'alice', true), ownerId: 'ring-alice'};
    expect(isOwner(recorded, {login: 'alice-renamed', id: 'ring-alice'})).toBe(true);
    expect(isOwner(recorded, {login: 'alice', id: 'ring-new-alice'})).toBe(false);
    expect(isOwner(board('old', 'alice', true), as('alice'))).toBe(true);
  });

  it('accepts a save only from the stored version', () => {
    const stored = {...board('s', 'alice', true), version: 3};
    expect(versionMatches(stored, 3)).toBe(true);
    expect(versionMatches(stored, 2)).toBe(false);
    expect(versionMatches(stored, undefined)).toBe(false);
    expect(versionMatches(board('old', 'alice', true), 0)).toBe(true);
  });
});
