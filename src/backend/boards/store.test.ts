import {describe, expect, it} from 'vitest';
import {createEmptyBoard} from '@/common/model/board-config';
import {canDelete, canEdit, canShare, isOwner, keepOmittedSettings, versionMatches, visibleBoards} from './store';

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
  it('hides personal boards from other users', () => {
    const doc = [board('s', 'alice', true), board('p', 'alice', false), board('q', 'bob', false)];
    expect(visibleBoards(doc, as('bob'), readsAll).map(b => b.id)).toEqual(['s', 'q']);
    expect(visibleBoards(doc, as('alice'), readsAll).map(b => b.id)).toEqual(['s', 'p']);
  });

  it('hides shared boards with a project the user cannot read', () => {
    const doc = [board('open', 'alice', true, ['SAN']), board('mixed', 'alice', true, ['SAN', 'SP'])];
    const readsSan = (p: {shortName: string}) => p.shortName === 'SAN';
    expect(visibleBoards(doc, as('bob'), readsSan).map(b => b.id)).toEqual(['open']);
  });

  it('always shows owners their own boards', () => {
    const doc = [board('s', 'alice', true, ['SP']), board('p', 'alice', false, ['SP'])];
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

  it('lets owners share when they can update issues in every project, or administer them', () => {
    const none = () => false;
    const onlySan = (p: {shortName: string}) => p.shortName === 'SAN';
    const all = () => true;
    expect(canShare(board('s', 'bob', true, ['SAN']), as('bob'), false, none, onlySan)).toBe(true);
    expect(canShare(board('m', 'bob', true, ['SAN', 'SP']), as('bob'), false, none, onlySan)).toBe(false);
    expect(canShare(board('m', 'bob', true, ['SAN', 'SP']), as('bob'), false, all, none)).toBe(true);
    expect(canShare(board('m', 'bob', true, ['SAN', 'SP']), as('bob'), true, none, none)).toBe(true);
    expect(canShare(board('e', 'bob', true, []), as('bob'), false, none, all)).toBe(false);
    // Only the owner shares, whatever rights others have.
    expect(canShare(board('s', 'alice', true, ['SAN']), as('bob'), true, all, all)).toBe(false);
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

describe('keepOmittedSettings', () => {
  const existing = {...createEmptyBoard('me'), id: 'b', pages: {mode: 'queries' as const, field: null, values: [], pages: [{id: 'p', name: 'P', query: ''}]}};
  const incoming = {...createEmptyBoard('me'), id: 'b', name: 'Renamed'};

  it('keeps the stored pages when an older widget saves without them', () => {
    const {pages: _pages, ...raw} = incoming;
    expect(keepOmittedSettings(incoming, raw, existing)).toEqual({...incoming, pages: existing.pages});
  });

  it('takes the sent pages, even when they are none', () => {
    expect(keepOmittedSettings(incoming, incoming, existing)).toBe(incoming);
  });
});
