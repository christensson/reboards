import {describe, expect, it} from 'vitest';
import {createEmptyBoard} from '@/common/model/board-config';
import {canEdit, parseBoardsDocument, readBoards, serializeBoardsDocument, visibleBoards, writeBoards} from './store';

const board = (id: string, owner: string, shared: boolean) => ({...createEmptyBoard(owner), id, name: id, shared});

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
    expect(visibleBoards(doc, 'bob').map(b => b.id)).toEqual(['s', 'q']);
    expect(visibleBoards(doc, 'alice').map(b => b.id)).toEqual(['s', 'p']);
  });

  it('lets owners and admins of shared boards edit', () => {
    expect(canEdit(board('s', 'alice', true), 'alice', false)).toBe(true);
    expect(canEdit(board('s', 'alice', true), 'bob', false)).toBe(false);
    expect(canEdit(board('s', 'alice', true), 'bob', true)).toBe(true);
    expect(canEdit(board('p', 'alice', false), 'bob', true)).toBe(false);
  });
});
