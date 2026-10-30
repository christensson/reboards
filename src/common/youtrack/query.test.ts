import {describe, expect, it} from 'vitest';
import {ALL_PAGE, type BoardConfig, NO_VALUE_PAGE, createEmptyBoard, emptyPages} from '@/common/model/board-config';
import {composeAgileQuery, composeQuery, effectiveQuery, quoteToken} from './query';

describe('quoteToken', () => {
  it('braces tokens with spaces or special characters', () => {
    expect(quoteToken('SP')).toBe('SP');
    expect(quoteToken('Sprint 1')).toBe('{Sprint 1}');
    expect(quoteToken('v1.0-beta')).toBe('v1.0-beta');
    expect(quoteToken('a:b')).toBe('{a:b}');
  });
});

describe('composeQuery', () => {
  it('scopes to projects only', () => {
    expect(composeQuery({projects: ['SP', 'my proj'], query: ''})).toBe('project: SP, {my proj}');
  });

  it('wraps the user query in parentheses when combined', () => {
    expect(composeQuery({projects: ['SP'], query: ' #Unresolved or Type: Bug '}))
      .toBe('project: SP and (#Unresolved or Type: Bug)');
  });

  it('adds the sprint clause', () => {
    expect(composeQuery({projects: ['SP'], query: '#Unresolved', sprintField: 'Sprints', sprint: 'Sprint 1'}))
      .toBe('project: SP and (#Unresolved) and Sprints: {Sprint 1}');
  });

  it('shows unscheduled issues when no sprint is selected', () => {
    expect(composeQuery({projects: [], query: 'Type: Bug', sprintField: 'Sprints', sprint: null})).toBe('Type: Bug and has: -Sprints');
    expect(composeQuery({projects: ['SP'], query: '', sprintField: 'Fix versions', sprint: ''})).toBe('project: SP and has: -{Fix versions}');
  });

  it('omits the sprint clause without a sprint field', () => {
    expect(composeQuery({projects: ['SP'], query: '', sprintField: null, sprint: null})).toBe('project: SP');
  });
});

describe('composeAgileQuery', () => {
  it('shows a sprint of an agile board, its backlog, or a board without sprints, narrowed by the extra filter', () => {
    const base = {boardField: 'Board sandbox Board', sprintsEnabled: true, query: '', projects: ['SAN']};
    expect(composeAgileQuery({...base, sprint: 'First sprint'})).toBe('{Board sandbox Board}: {First sprint}');
    // The backlog: the board's projects' issues that are on no sprint of the board.
    expect(composeAgileQuery({...base, sprint: null, query: '#Unresolved'})).toBe('project: SAN and has: -{Board sandbox Board} and (#Unresolved)');
    expect(composeAgileQuery({...base, boardField: 'Board sandbox Overview', sprintsEnabled: false, sprint: 'x'})).toBe('has: {Board sandbox Overview}');
  });
});

describe('effectiveQuery with pages', () => {
  const board = (changes: Partial<BoardConfig>): BoardConfig => ({...createEmptyBoard('me'), projects: [{id: '0-1', shortName: 'SP'}], ...changes});
  const fieldPages = {...emptyPages(), mode: 'field' as const, field: {name: 'Fix versions', kind: 'version' as const}};

  it('narrows the board query to a field page', () => {
    const b = board({query: '#Unresolved or #Bug', pages: fieldPages});
    expect(effectiveQuery(b, null, undefined, '1.0 beta')).toBe('project: SP and ((#Unresolved or #Bug) and {Fix versions}: {1.0 beta})');
    expect(effectiveQuery(b, null, undefined, NO_VALUE_PAGE)).toBe('project: SP and ((#Unresolved or #Bug) and has: -{Fix versions})');
    expect(effectiveQuery(b, null, undefined, ALL_PAGE)).toBe('project: SP and (#Unresolved or #Bug)');
    expect(effectiveQuery(board({pages: fieldPages}), null, undefined, 'v1')).toBe('project: SP and ({Fix versions}: v1)');
  });

  it('applies field pages to a linked agile board', () => {
    const b = board({agileSource: {id: '1', name: 'Team'}, pages: {...fieldPages, field: {name: 'Assignee', kind: 'user'}}});
    expect(effectiveQuery(b, 'S1', {name: 'Team', sprintsEnabled: true}, 'jdoe')).toBe('{Board Team}: S1 and (Assignee: jdoe)');
  });

  it('replaces the board query with the query of a query page, keeping the sprint', () => {
    const pages = {...emptyPages(), mode: 'queries' as const, pages: [{id: 'a', name: 'Bugs', query: 'Type: Bug'}, {id: 'b', name: 'Mine', query: 'for: me'}]};
    const b = board({query: 'ignored', sprints: {enabled: true, field: {name: 'Sprint', kind: 'version'}}, pages});
    expect(effectiveQuery(b, 'S1', undefined, 'a')).toBe('project: SP and (Type: Bug) and Sprint: S1');
    expect(effectiveQuery(b, null, undefined, null)).toBe('project: SP and ((Type: Bug) or (for: me)) and has: -Sprint');
    expect(effectiveQuery(board({pages: {...pages, pages: [...pages.pages, {id: 'c', name: 'All', query: ''}]}}), null)).toBe('project: SP');
  });
});
