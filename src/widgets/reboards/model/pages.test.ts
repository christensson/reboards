import {describe, expect, it} from 'vitest';
import {ALL_PAGE, type BoardConfig, NO_VALUE_PAGE, createEmptyBoard} from '@/common/model/board-config';
import type {FieldUniverse, ResolvedField} from './fieldUniverse';
import {boardPages, defaultPage, orderPages, pageParam, resolvePage} from './pages';

const field = (name: string, values: ResolvedField['values'], canBeEmpty = true): ResolvedField => ({
  name, kind: 'enum', multi: false, typeId: 'enum[1]', projectsCount: 1, inconsistent: false, canBeEmpty, values
});

const universeOf = (...fields: ResolvedField[]): FieldUniverse => ({fields, byName: new Map(fields.map(f => [f.name, f])), projectCount: 1});

const priority = field('Priority', [{key: 'Major', label: 'Major', ordinal: 0}, {key: 'Minor', label: 'Minor', ordinal: 1}]);

const withPages = (pages: Partial<BoardConfig['pages']>): BoardConfig => {
  const board = createEmptyBoard('me');
  return {...board, pages: {...board.pages, ...pages}};
};

describe('boardPages', () => {
  it('has no pages without a page mode', () => {
    expect(boardPages(createEmptyBoard('me'), universeOf(priority))).toBeNull();
  });

  it('lists All, every value and No <field> for a field that can be empty', () => {
    const pages = boardPages(withPages({mode: 'field', field: {name: 'Priority', kind: 'enum'}}), universeOf(priority));
    expect(pages?.map(p => p.key)).toEqual([ALL_PAGE, 'Major', 'Minor', NO_VALUE_PAGE]);
    expect(pages?.[3].label).toBe('No Priority');
    expect(pages?.map(p => p.selectedLabel)).toEqual(['Priority: All', 'Priority: Major', 'Priority: Minor', 'Priority: None']);
  });

  it('leaves out No <field> for a required field and archived versions', () => {
    const versions = field('Fix', [{key: 'v1', label: 'v1', ordinal: 0, archived: true}, {key: 'v2', label: 'v2', ordinal: 1}], false);
    const pages = boardPages(withPages({mode: 'field', field: {name: 'Fix', kind: 'version'}}), universeOf(versions));
    expect(pages?.map(p => p.key)).toEqual([ALL_PAGE, 'v2']);
  });

  it('shows only the chosen values, in their order, with user names as titles', () => {
    const assignee = field('Assignee', [{key: 'jdoe', label: 'John Doe', ordinal: 0}]);
    const pages = boardPages(
      withPages({mode: 'field', field: {name: 'Assignee', kind: 'user'}, values: [NO_VALUE_PAGE, 'jdoe', 'gone']}),
      universeOf(assignee)
    );
    expect(pages?.map(p => [p.key, p.label])).toEqual([[ALL_PAGE, 'All'], [NO_VALUE_PAGE, 'No Assignee'], ['jdoe', 'John Doe'], ['gone', 'gone']]);
  });

  it('lists query pages by id and name', () => {
    const pages = boardPages(withPages({mode: 'queries', pages: [{id: 'a', name: 'Bugs', query: 'Type: Bug'}]}), universeOf());
    expect(pages).toEqual([{key: 'a', label: 'Bugs'}]);
    expect(pages?.[0].selectedLabel).toBeUndefined();
  });
});

describe('resolvePage', () => {
  const queryPages = [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}, {key: 'c', label: 'C'}];

  it('keeps a page the board has', () => {
    expect(resolvePage(queryPages, 'b', [])).toBe('b');
  });

  it('falls back to the first starred page, else the first page', () => {
    expect(resolvePage(queryPages, null, ['c'])).toBe('c');
    expect(resolvePage(queryPages, 'gone', ['gone'])).toBe('a');
    expect(defaultPage([], [])).toBeNull();
  });

  it('defaults to All for field pages', () => {
    expect(resolvePage([{key: ALL_PAGE, label: 'All', pinned: true}, {key: 'x', label: 'x'}], null, ['x'])).toBe(ALL_PAGE);
    expect(pageParam(ALL_PAGE)).toBeNull();
    expect(pageParam('x')).toBe('x');
  });

  it('has no page on a board without pages', () => {
    expect(resolvePage(null, 'a', [])).toBeNull();
  });
});

describe('orderPages', () => {
  it('keeps All first and splits starred pages from the others in configured order', () => {
    const all = {key: ALL_PAGE, label: 'All', pinned: true};
    const pages = [all, {key: 'z', label: 'Z'}, {key: 'a', label: 'A'}, {key: 'm', label: 'M'}];
    expect(orderPages(pages, ['m', 'z', ALL_PAGE])).toEqual({pinned: [all], starred: [pages[1], pages[3]], others: [pages[2]]});
  });
});
