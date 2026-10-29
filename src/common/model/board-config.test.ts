import {describe, expect, it} from 'vitest';
import {type BoardConfig, BOARD_LIMITS, availableRowModes, effectiveRowMode, emptyTimeline, columnLabel, createEmptyBoard, isTwoLevel, normalizeBoardConfig, relatedBoardsOf, swapSwimlanes, validateBoardConfig, validateBoardSize, defaultDynamicOptions} from './board-config';

describe('normalizeBoardConfig', () => {
  it('fills defaults for an empty document', () => {
    const config = normalizeBoardConfig({}, 'alice');
    expect(config.owner).toBe('alice');
    expect(config.columnField).toEqual({name: 'State', kind: 'state'});
    expect(config.row.field).toEqual({name: 'Priority', kind: 'enum'});
    expect(config.linkTypes).toEqual(['Subtask']);
    expect(config.shared).toBe(false);
    expect(config.cardColorField).toEqual({name: 'Type', kind: 'enum'});
    expect(config.innerRow).toBeNull();
  });

  it('normalizes the optional second swimlane field', () => {
    expect(normalizeBoardConfig({innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'alphabetical', customOrder: [], dynamic: defaultDynamicOptions()}}).innerRow)
      .toEqual({field: {name: 'Type', kind: 'enum'}, sort: 'alphabetical', customOrder: [], dynamic: defaultDynamicOptions()});
    expect(normalizeBoardConfig({innerRow: 'nope'}).innerRow).toBeNull();
    expect(isTwoLevel(normalizeBoardConfig({innerRow: {field: {name: 'Type', kind: 'enum'}}}))).toBe(true);
    expect(isTwoLevel(normalizeBoardConfig({innerRow: {field: null}}))).toBe(false);
    expect(isTwoLevel(normalizeBoardConfig({}))).toBe(false);
  });

  it('drops unknown keys and malformed entries', () => {
    const config = normalizeBoardConfig({
      id: 'b1',
      name: 'Board',
      owner: 'bob',
      bogus: 1,
      columns: [{id: 'c1', values: ['Open', 3]}, 'nope', {values: ['Done']}],
      projects: [{id: '0-1', shortName: 'DEMO'}, {id: 5}],
      row: {field: null, sort: 'weird', customOrder: ['A'], dynamic: defaultDynamicOptions()},
      sprints: {enabled: true, field: {name: 'Sprint', kind: 'version'}},
      cardColorField: null
    });
    expect(config.cardColorField).toBeNull();
    expect('bogus' in config).toBe(false);
    expect(config.columns).toEqual([{id: 'c1', values: ['Open']}, {id: 'col-1', values: ['Done']}]);
    expect(config.projects).toEqual([{id: '0-1', shortName: 'DEMO'}]);
    expect(config.row).toEqual({field: null, sort: 'custom', customOrder: ['A'], dynamic: defaultDynamicOptions()});
    expect(config.sprints).toEqual({enabled: true, field: {name: 'Sprint', kind: 'version'}});
  });

  it('round-trips a full board', () => {
    const board = {...createEmptyBoard('carol'), id: 'x', name: 'N', columns: [{id: 'a', values: ['Open']}]};
    expect(normalizeBoardConfig(board)).toEqual(board);
  });
});

describe('validateBoardConfig', () => {
  const valid = () => ({
    ...createEmptyBoard('alice'),
    name: 'Team board',
    projects: [{id: '0-1', shortName: 'DEMO'}],
    columns: [{id: 'c1', values: ['Open']}, {id: 'c2', values: ['In Progress', 'Review']}]
  });

  it('accepts a valid config', () => {
    expect(validateBoardConfig(valid())).toEqual([]);
  });

  it('needs no configured columns for an enum treated as a changing field', () => {
    const enumBoard = {...valid(), columnField: {name: 'Priority', kind: 'enum' as const}, columns: []};
    expect(validateBoardConfig(enumBoard).map(i => i.message)).toEqual(['Add at least one column']);
    expect(validateBoardConfig({...enumBoard, columnOptions: {...defaultDynamicOptions(), asDynamic: true}})).toEqual([]);
    expect(normalizeBoardConfig({columnOptions: {asDynamic: true, sort: 'order'}}).columnOptions).toMatchObject({asDynamic: true, sort: 'order'});
  });

  it('reports missing name, projects and columns', () => {
    const fields = validateBoardConfig({...valid(), name: ' ', projects: [], columns: []}).map(i => i.field);
    expect(fields).toEqual(['name', 'projects', 'columns']);
  });

  it('reports duplicate and ignored column values', () => {
    const config = valid();
    config.columns.push({id: 'c3', values: ['Open']});
    config.ignoredValues = ['Review'];
    const messages = validateBoardConfig(config).map(i => i.message);
    expect(messages).toContain('Value "Open" is used in more than one column');
    expect(messages).toContain('Value "Review" is both in a column and ignored');
  });

  it('validates the second swimlane field', () => {
    const inner = {field: {name: 'Priority', kind: 'enum' as const}, sort: 'custom' as const, customOrder: [], dynamic: defaultDynamicOptions()};
    expect(validateBoardConfig({...valid(), innerRow: inner}).map(i => i.message)).toEqual(['The two swimlane fields must be different']);
    expect(validateBoardConfig({...valid(), row: {field: null, sort: 'custom', customOrder: [], dynamic: defaultDynamicOptions()}, innerRow: inner}).map(i => i.message))
      .toEqual(['Set the first swimlane field before the second']);
    expect(validateBoardConfig({...valid(), innerRow: {...inner, field: {name: 'Type', kind: 'enum'}}})).toEqual([]);
  });

  it('requires a sprint field when sprints are enabled', () => {
    const config = {...valid(), sprints: {enabled: true, field: null}};
    expect(validateBoardConfig(config).map(i => i.field)).toEqual(['sprints']);
  });
});

describe('swapSwimlanes', () => {
  it('exchanges the two levels only when both are set', () => {
    const inner = {field: {name: 'Type', kind: 'enum' as const}, sort: 'alphabetical' as const, customOrder: [], dynamic: defaultDynamicOptions()};
    const board = {...createEmptyBoard('me'), innerRow: inner};
    const swapped = swapSwimlanes(board);
    expect(swapped.row).toEqual(inner);
    expect(swapped.innerRow).toEqual(board.row);
    expect(swapSwimlanes(createEmptyBoard('me'))).toEqual(createEmptyBoard('me'));
  });
});

describe('columnLabel', () => {
  it('prefers the custom name and falls back to joined values', () => {
    expect(columnLabel({id: 'a', name: 'Doing', values: ['In Progress']})).toBe('Doing');
    expect(columnLabel({id: 'a', values: ['In Progress', 'Review']})).toBe('In Progress / Review');
  });
});

describe('validateBoardSize', () => {
  const valid = (): ReturnType<typeof createEmptyBoard> => ({
    ...createEmptyBoard('alice'),
    name: 'Board',
    projects: [{id: '0-1', shortName: 'SAN'}],
    columns: [{id: 'c1', values: ['Open']}]
  });

  it('accepts a normal board', () => {
    expect(validateBoardConfig(valid())).toEqual([]);
  });

  it('rejects long texts, long queries and too many entries', () => {
    const long = 'x'.repeat(BOARD_LIMITS.textLength + 1);
    expect(validateBoardConfig({...valid(), name: long}).map(p => p.field)).toContain('size');
    expect(validateBoardConfig({...valid(), query: 'x'.repeat(BOARD_LIMITS.queryLength + 1)}).map(p => p.field)).toContain('query');
    const values = Array.from({length: BOARD_LIMITS.values + 1}, (_, i) => `v${i}`);
    expect(validateBoardConfig({...valid(), ignoredValues: values}).map(p => p.field)).toContain('size');
    const fields = Array.from({length: BOARD_LIMITS.listItems + 1}, (_, i) => `f${i}`);
    expect(validateBoardConfig({...valid(), cardFields: fields}).map(p => p.field)).toContain('size');
  });
});

describe('dynamic column and swimlane fields', () => {
  const board = (): BoardConfig => ({
    ...createEmptyBoard('alice'),
    name: 'Board',
    projects: [{id: '0-1', shortName: 'SAN'}],
    columnField: {name: 'Assignee', kind: 'user'}
  });

  it('fills dynamic defaults for stored boards without them', () => {
    const config = normalizeBoardConfig({row: {field: {name: 'Fix versions', kind: 'version'}}});
    expect(config.columnOptions).toEqual({sort: 'alphabetical', asDynamic: false, showReleased: true, showArchived: false, maxColumns: 5});
    expect(config.row.dynamic.showArchived).toBe(false);
    expect(normalizeBoardConfig({columnField: {name: 'Fixed in build', kind: 'build'}}).columnField.kind).toBe('build');
  });

  it('needs no explicit columns for a dynamic column field', () => {
    expect(validateBoardConfig(board())).toEqual([]);
    expect(validateBoardConfig({...board(), columnOptions: {...board().columnOptions, maxColumns: 0}}).map(p => p.field)).toEqual(['columns']);
  });

  it('keeps the sprint field out of columns and swimlanes', () => {
    const sprintBoard = {...board(), sprints: {enabled: true, field: {name: 'Sprints', kind: 'version' as const}}};
    expect(validateBoardConfig(sprintBoard)).toEqual([]);
    expect(validateBoardConfig({...sprintBoard, columnField: {name: 'Sprints', kind: 'version'}}).map(p => p.field)).toEqual(['sprints']);
    expect(validateBoardConfig({...sprintBoard, row: {...sprintBoard.row, field: {name: 'Sprints', kind: 'version'}}}).map(p => p.field)).toEqual(['sprints']);
  });
});


describe('relatedBoards', () => {
  const board = (id: string, name: string, relatedBoards: string[] = []) => ({...createEmptyBoard('me'), id, name, relatedBoards});

  it('drops duplicates, the board itself and non-strings', () => {
    expect(normalizeBoardConfig({id: 'a', relatedBoards: ['b', 'b', 'a', 7, '']}).relatedBoards).toEqual(['b']);
    expect(normalizeBoardConfig({id: 'a'}).relatedBoards).toEqual([]);
  });

  it('limits the number of related boards', () => {
    const many = Array.from({length: BOARD_LIMITS.listItems + 1}, (_v, i) => `b${i}`);
    expect(validateBoardSize({...board('a', 'A'), relatedBoards: many}).map(i => i.field)).toContain('relatedBoards');
  });

  it('finds related boards both ways, by name, ignoring boards that are gone or hidden', () => {
    const sprint = board('s', 'Sprint', ['b', 'gone']);
    const backlog = board('b', 'Backlog');
    const other = board('o', 'Another backlog', ['s']);
    const unrelated = board('u', 'Unrelated');
    expect(relatedBoardsOf(sprint, [sprint, backlog, other, unrelated]).map(r => [r.board.id, r.direction])).toEqual([['o', 'in'], ['b', 'out']]);
    expect(relatedBoardsOf(backlog, [sprint, backlog, other]).map(r => [r.board.id, r.direction])).toEqual([['s', 'in']]);
  });
});

describe('row modes', () => {
  const both = (): BoardConfig => ({...createEmptyBoard('me'), timeline: {...emptyTimeline(), field: {name: 'Due Date', kind: 'date'}}});

  it('offers the layouts the board has set up and picks the user\'s, else the default', () => {
    expect(availableRowModes(both())).toEqual(['swimlanes', 'time']);
    expect(effectiveRowMode(both(), undefined)).toBe('swimlanes');
    expect(effectiveRowMode({...both(), defaultRowMode: 'time'}, undefined)).toBe('time');
    expect(effectiveRowMode(both(), 'time')).toBe('time');
    const timeOnly = {...both(), row: {...both().row, field: null}};
    expect(effectiveRowMode(timeOnly, 'swimlanes')).toBe('time');
    expect(effectiveRowMode({...timeOnly, timeline: emptyTimeline()}, undefined)).toBe('none');
  });

  it('normalizes and validates the time layout', () => {
    expect(normalizeBoardConfig({}).timeline).toEqual(emptyTimeline());
    expect(normalizeBoardConfig({timeline: {field: {name: 'Due Date', kind: 'date'}, sort: 'desc', dateRole: 'odd'}}).timeline)
      .toMatchObject({field: {name: 'Due Date', kind: 'date'}, sort: 'desc', dateRole: 'end'});
    const board = {...both(), name: 'B', projects: [{id: '1', shortName: 'SAN'}], columns: [{id: 'c', values: ['Open']}]};
    expect(validateBoardConfig(board)).toEqual([]);
    expect(validateBoardConfig({...board, timeline: {...board.timeline, field: {name: 'Type', kind: 'enum'}}}).map(i => i.field)).toEqual(['timeline']);
    expect(validateBoardConfig({...board, timeline: {...board.timeline, field: {name: 'Fix versions', kind: 'version'}, periodField: {name: 'Estimation', kind: 'period'}}}).map(i => i.field))
      .toEqual(['timeline']);
  });
});
