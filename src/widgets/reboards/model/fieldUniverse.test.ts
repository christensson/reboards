import {describe, expect, it} from 'vitest';
import {createEmptyBoard} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {applyUniverseDefaults, buildFieldUniverse, defaultColumnField, defaultColumns, defaultRowField, fieldsMatching} from './fieldUniverse';

const pf = (name: string, typeId: string, values: string[] = [], $type = 'EnumBundle'): YtProjectCustomField => ({
  id: `pf-${name}`,
  $type: 'X',
  field: {id: `f-${name}`, name, fieldType: {id: typeId, valueType: typeId}},
  bundle: values.length > 0 ? {id: 'b', $type, values: values.map((v, i) => ({id: `v-${i}`, name: v, ordinal: i}))} : null
});

const userField = (): YtProjectCustomField => ({
  id: 'pf-a', $type: 'UserProjectCustomField',
  field: {id: 'f-a', name: 'Assignee', fieldType: {id: 'user[1]', valueType: 'user'}},
  bundle: {id: 'ub', $type: 'UserBundle', values: [{id: 'g', name: 'Team'}], aggregatedUsers: [{id: 'u1', login: 'jdoe', fullName: 'John Doe'}]}
});

describe('buildFieldUniverse', () => {
  it('merges values across projects by name and keeps first-seen order', () => {
    const u = buildFieldUniverse([
      [pf('State2', 'state[1]', ['Open', 'Done'], 'StateBundle'), pf('Priority', 'enum[1]', ['Major', 'Minor'])],
      [pf('State2', 'state[1]', ['Open', 'Review', 'Done'], 'StateBundle'), pf('Story points', 'integer')]
    ]);
    expect(u.projectCount).toBe(2);
    expect(u.byName.get('State2')?.values.map(v => v.key)).toEqual(['Open', 'Done', 'Review']);
    expect(u.byName.get('State2')?.projectsCount).toBe(2);
    expect(u.byName.get('Priority')?.projectsCount).toBe(1);
    expect(u.byName.get('Story points')?.kind).toBe('integer');
  });

  it('tracks whether a field can be empty', () => {
    const required = {...pf('Type', 'enum[1]', ['Bug']), canBeEmpty: false};
    const u = buildFieldUniverse([[required, pf('Assignee', 'user[1]')], [{...pf('Type', 'enum[1]', ['Bug']), canBeEmpty: true}]]);
    expect(u.byName.get('Type')?.canBeEmpty).toBe(true);
    expect(u.byName.get('Assignee')?.canBeEmpty).toBe(true);
    expect(buildFieldUniverse([[required]]).byName.get('Type')?.canBeEmpty).toBe(false);
  });

  it('flags inconsistent field types', () => {
    const u = buildFieldUniverse([[pf('Type', 'enum[1]', ['Bug'])], [pf('Type', 'state[1]', ['Open'], 'StateBundle')]]);
    expect(u.byName.get('Type')?.inconsistent).toBe(true);
    expect(fieldsMatching(u, {kinds: ['enum', 'state']})).toEqual([]);
  });

  it('uses aggregated users for user fields', () => {
    const u = buildFieldUniverse([[userField()]]);
    expect(u.byName.get('Assignee')?.values).toEqual([{key: 'jdoe', label: 'John Doe', ordinal: 0}]);
  });

  it('filters by kind and multiplicity', () => {
    const u = buildFieldUniverse([[pf('Sprints', 'version[*]', ['S1']), pf('Fix', 'version[1]', ['1.0']), pf('State2', 'state[1]', ['Open'], 'StateBundle')]]);
    expect(fieldsMatching(u, {kinds: ['version']}).map(f => f.name)).toEqual(['Fix', 'Sprints']);
    expect(fieldsMatching(u, {kinds: ['version'], singleOnly: true}).map(f => f.name)).toEqual(['Fix']);
  });
});

describe('defaults', () => {
  const u = buildFieldUniverse([[
    pf('Type', 'enum[1]', ['Bug', 'Task']),
    pf('State2', 'state[1]', ['Open', 'In Progress', 'Done'], 'StateBundle'),
    pf('Priority', 'enum[1]', ['Major', 'Minor']),
    pf('Estimation', 'integer')
  ]]);

  it('picks state for columns and Priority for rows', () => {
    expect(defaultColumnField(u)).toEqual({name: 'State2', kind: 'state'});
    expect(defaultRowField(u)).toEqual({name: 'Priority', kind: 'enum'});
    expect(defaultColumns(u, 'State2').map(c => c.values)).toEqual([['Open'], ['In Progress'], ['Done']]);
  });

  it('applies defaults to a new board', () => {
    const board = applyUniverseDefaults(createEmptyBoard('me'), u);
    expect(board.columnField.name).toBe('State2');
    expect(board.columns).toHaveLength(3);
    expect(board.row.customOrder).toEqual(['Major', 'Minor']);
    expect(board.cardFields).toEqual(['Type', 'Estimation']);
    expect(board.cardColorField).toEqual({name: 'Type', kind: 'enum'});
  });
});
