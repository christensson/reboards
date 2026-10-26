import {describe, expect, it} from 'vitest';
import {columnLabel, createEmptyBoard, isTwoLevel, normalizeBoardConfig, swapSwimlanes, validateBoardConfig} from './board-config';

describe('normalizeBoardConfig', () => {
  it('fills defaults for an empty document', () => {
    const config = normalizeBoardConfig({}, 'alice');
    expect(config.owner).toBe('alice');
    expect(config.columnField).toEqual({name: 'State', kind: 'state'});
    expect(config.row.field).toEqual({name: 'Priority', kind: 'enum'});
    expect(config.linkTypes).toEqual(['Subtask']);
    expect(config.shared).toBe(true);
    expect(config.cardColorField).toEqual({name: 'Type', kind: 'enum'});
    expect(config.innerRow).toBeNull();
  });

  it('normalizes the optional second swimlane field', () => {
    expect(normalizeBoardConfig({innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'alphabetical', customOrder: []}}).innerRow)
      .toEqual({field: {name: 'Type', kind: 'enum'}, sort: 'alphabetical', customOrder: []});
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
      row: {field: null, sort: 'weird', customOrder: ['A']},
      sprints: {enabled: true, field: {name: 'Sprint', kind: 'version'}},
      cardColorField: null
    });
    expect(config.cardColorField).toBeNull();
    expect('bogus' in config).toBe(false);
    expect(config.columns).toEqual([{id: 'c1', values: ['Open']}, {id: 'col-1', values: ['Done']}]);
    expect(config.projects).toEqual([{id: '0-1', shortName: 'DEMO'}]);
    expect(config.row).toEqual({field: null, sort: 'custom', customOrder: ['A']});
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
    const inner = {field: {name: 'Priority', kind: 'enum' as const}, sort: 'custom' as const, customOrder: []};
    expect(validateBoardConfig({...valid(), innerRow: inner}).map(i => i.message)).toEqual(['The two swimlane fields must be different']);
    expect(validateBoardConfig({...valid(), row: {field: null, sort: 'custom', customOrder: []}, innerRow: inner}).map(i => i.message))
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
    const inner = {field: {name: 'Type', kind: 'enum' as const}, sort: 'alphabetical' as const, customOrder: []};
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
