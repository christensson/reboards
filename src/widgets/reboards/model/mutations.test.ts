import {describe, expect, it} from 'vitest';
import {type BoardConfig, UNCATEGORIZED_ROW_KEY, createEmptyBoard, defaultDynamicOptions} from '@/common/model/board-config';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutRow} from './layout';
import {applyChanges, nextKeys, planMove} from './mutations';

const row = (key: string, outerValue: string | null, innerValue: string | null, kind: LayoutRow['kind'] = 'normal'): LayoutRow =>
  ({key, kind, outerValue, innerValue} as LayoutRow);

const config: BoardConfig = {
  ...createEmptyBoard('me'),
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'wip', values: ['In Progress', 'Review']}],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: [], dynamic: defaultDynamicOptions()}
};

describe('planMove', () => {
  it('changes the column field for single-value columns', () => {
    expect(planMove(config, {rowKey: 'Major', columnId: 'wip'}, {rowKey: 'Major', columnId: 'open'}))
      .toEqual({changes: [{field: {name: 'State', kind: 'state'}, valueKey: 'Open'}]});
  });

  it('asks for a value when the column has several', () => {
    const plan = planMove(config, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Minor', columnId: 'wip'});
    expect(plan.pickColumn?.id).toBe('wip');
    expect(plan.changes).toEqual([{field: {name: 'Priority', kind: 'enum'}, valueKey: 'Minor'}]);
  });

  it('clears the row field when dropped in Uncategorized and ignores same-cell drops', () => {
    expect(planMove(config, {rowKey: 'Major', columnId: 'open'}, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: 'open'}).changes)
      .toEqual([{field: {name: 'Priority', kind: 'enum'}, valueKey: null}]);
    expect(planMove(config, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Major', columnId: 'open'})).toEqual({changes: []});
  });
});

describe('planMove on two-level boards', () => {
  const twoLevel: BoardConfig = {...config, innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'custom', customOrder: [], dynamic: defaultDynamicOptions()}};
  const rowsByKey = {
    'Major\u0000Bug': row('Major\u0000Bug', 'Major', 'Bug'),
    'Major\u0000Task': row('Major\u0000Task', 'Major', 'Task'),
    'Minor\u0000Bug': row('Minor\u0000Bug', 'Minor', 'Bug'),
    'Minor\u0000__uncategorized__': row('Minor\u0000__uncategorized__', 'Minor', null),
    'Minor\u0000__pick__': row('Minor\u0000__pick__', 'Minor', null, 'picker')
  };

  it('changes only the level that differs', () => {
    expect(planMove(twoLevel, {rowKey: 'Major\u0000Bug', columnId: 'open'}, {rowKey: 'Major\u0000Task', columnId: 'open'}, rowsByKey).changes)
      .toEqual([{field: {name: 'Type', kind: 'enum'}, valueKey: 'Task', replaceKey: 'Bug'}]);
    expect(planMove(twoLevel, {rowKey: 'Major\u0000Bug', columnId: 'open'}, {rowKey: 'Minor\u0000Bug', columnId: 'open'}, rowsByKey).changes)
      .toEqual([{field: {name: 'Priority', kind: 'enum'}, valueKey: 'Minor', replaceKey: 'Major'}]);
  });

  it('changes both levels and clears an uncategorized inner value', () => {
    expect(planMove(twoLevel, {rowKey: 'Major\u0000Bug', columnId: 'open'}, {rowKey: 'Minor\u0000__uncategorized__', columnId: 'open'}, rowsByKey).changes)
      .toEqual([
        {field: {name: 'Priority', kind: 'enum'}, valueKey: 'Minor', replaceKey: 'Major'},
        {field: {name: 'Type', kind: 'enum'}, valueKey: null, replaceKey: 'Bug'}
      ]);
  });

  it('asks for the inner value on a picker row and keeps the outer change', () => {
    const plan = planMove(twoLevel, {rowKey: 'Major\u0000Bug', columnId: 'open'}, {rowKey: 'Minor\u0000__pick__', columnId: 'open'}, rowsByKey);
    expect(plan.choices).toEqual([{field: {name: 'Type', kind: 'enum'}, replaceKey: 'Bug'}]);
    expect(plan.changes).toEqual([{field: {name: 'Priority', kind: 'enum'}, valueKey: 'Minor', replaceKey: 'Major'}]);
  });

  it('asks for the first-level value on an outer picker row and keeps the second level', () => {
    const outerPicker = row('__pick__\u0000__pick__', null, null, 'picker');
    const rows = {...rowsByKey, [outerPicker.key]: {...outerPicker, pickLevel: 'outer' as const}};
    const plan = planMove(twoLevel, {rowKey: 'Major\u0000Bug', columnId: 'open'}, {rowKey: outerPicker.key, columnId: 'open'}, rows);
    expect(plan).toEqual({changes: [], choices: [{field: {name: 'Priority', kind: 'enum'}, replaceKey: 'Major'}]});
  });
});

describe('planMove in the time layout', () => {
  const day = Date.UTC(2026, 4, 12);
  const timeRow = (key: string, time: number | null, timeNames: string[] = []): LayoutRow => ({...row(key, null, null, 'time'), time, timeNames, ...(time === null ? {} : {day: time})});
  const rows = {'t:1': timeRow('t:1', Date.UTC(2026, 4, 1), ['1.0']), 't:2': timeRow('t:2', day, ['2.0']), 'none': timeRow('none', null)};
  const dated: BoardConfig = {...config, timeline: {...config.timeline, field: {name: 'Due Date', kind: 'date'}}};

  it('sets the target row\'s date, at noon UTC, along with the column', () => {
    expect(planMove(dated, {rowKey: 't:1', columnId: 'wip'}, {rowKey: 't:2', columnId: 'open'}, rows).changes).toEqual([
      {field: {name: 'State', kind: 'state'}, valueKey: 'Open'},
      {field: {name: 'Due Date', kind: 'date'}, valueKey: String(day + 12 * 3_600_000)}
    ]);
    expect(planMove(dated, {rowKey: 't:1', columnId: 'open'}, {rowKey: 'none', columnId: 'open'}, rows).changes)
      .toEqual([{field: {name: 'Due Date', kind: 'date'}, valueKey: null}]);
  });

  it('swaps the version the card leaves for the target row\'s, and skips the far end of a date plus period', () => {
    const versions: BoardConfig = {...config, timeline: {...config.timeline, field: {name: 'Fix versions', kind: 'version'}}};
    expect(planMove(versions, {rowKey: 't:1', columnId: 'open'}, {rowKey: 't:2', columnId: 'open'}, rows).changes)
      .toEqual([{field: {name: 'Fix versions', kind: 'version'}, valueKey: '2.0', replaceKey: '1.0'}]);
    const ranged: BoardConfig = {...dated, timeline: {...dated.timeline, periodField: {name: 'Estimation', kind: 'period'}, dateRole: 'start', position: 'end'}};
    expect(planMove(ranged, {rowKey: 't:1', columnId: 'open'}, {rowKey: 't:2', columnId: 'open'}, rows).changes).toEqual([]);
  });
});

describe('applyChanges', () => {
  it('updates fields using universe metadata', () => {
    const universe = buildFieldUniverse([[{
      id: 'pf', $type: 'X', field: {id: 'f', name: 'State', fieldType: {id: 'state[1]', valueType: 'state'}},
      bundle: {id: 'b', $type: 'StateBundle', values: [{id: 'v', name: 'Open', isResolved: false, color: {background: '#1', foreground: '#2'}}]}
    }]]);
    const issue: BoardIssue = {
      id: '1', idReadable: 'SP-1', summary: '', projectId: '', projectShortName: 'SP', number: 1, tags: [], links: [], parentIds: [], childIds: [],
      fields: {State: {$type: 'StateIssueCustomField', key: 'Done', label: 'Done', labels: ['Done'], keys: ['Done']}}
    };
    const updated = applyChanges(issue, [{field: {name: 'State', kind: 'state'}, valueKey: 'Open'}, {field: {name: 'Priority', kind: 'enum'}, valueKey: null}], universe);
    expect(updated.fields.State).toEqual({$type: 'StateIssueCustomField', key: 'Open', label: 'Open', labels: ['Open'], keys: ['Open'], color: {background: '#1', foreground: '#2'}, isResolved: false});
    expect(updated.fields.Priority).toBeNull();
    expect(issue.fields.State?.key).toBe('Done');
  });
});

describe('planMove with dynamic columns', () => {
  const board: BoardConfig = {...createEmptyBoard('me'), columnField: {name: 'Assignee', kind: 'user'}, columns: [], row: {...createEmptyBoard('me').row, field: null}};
  const columns = [
    {id: '__none__', values: [], columnKey: null},
    {id: 'v:ann', values: ['ann'], columnKey: 'ann'},
    {id: '__assign__', values: [], assign: true}
  ];

  it('sets the value of the target column, or clears it in the "No <field>" column', () => {
    expect(planMove(board, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: '__none__'}, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: 'v:ann'}, {}, columns).changes)
      .toEqual([{field: board.columnField, valueKey: 'ann', replaceKey: null}]);
    expect(planMove(board, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: 'v:ann'}, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: '__none__'}, {}, columns).changes)
      .toEqual([{field: board.columnField, valueKey: null, replaceKey: 'ann'}]);
  });

  it('asks for the value in the "Assign <field>…" column, swapping the one the card leaves', () => {
    expect(planMove(board, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: 'v:ann'}, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: '__assign__'}, {}, columns))
      .toEqual({changes: [], choices: [{field: board.columnField, replaceKey: 'ann'}]});
  });
});

describe('nextKeys', () => {
  const field = {name: 'Fix versions', kind: 'version' as const};

  it('swaps only the value the card was dragged from in a multi-value field', () => {
    expect(nextKeys(['v1', 'v2'], {field, valueKey: 'v3', replaceKey: 'v1'}, true)).toEqual(['v2', 'v3']);
    expect(nextKeys(['v1', 'v2'], {field, valueKey: 'v2', replaceKey: 'v1'}, true)).toEqual(['v2']);
    expect(nextKeys(['v1', 'v2'], {field, valueKey: null, replaceKey: 'v1'}, true)).toEqual(['v2']);
    expect(nextKeys([], {field, valueKey: 'v1', replaceKey: null}, true)).toEqual(['v1']);
  });

  it('adds and removes the values checked and unchecked in the value selector, keeping the others', () => {
    expect(nextKeys(['v1', 'v2'], {field, valueKey: 'v3', delta: {add: ['v3'], remove: ['v1']}, replaceKey: 'v1'}, true)).toEqual(['v2', 'v3']);
    expect(nextKeys(['v1', 'v9'], {field, valueKey: null, delta: {add: [], remove: ['v1']}}, true)).toEqual(['v9']);
  });

  it('sets single-value fields outright', () => {
    expect(nextKeys(['ann'], {field: {name: 'Assignee', kind: 'user'}, valueKey: 'bob', replaceKey: 'ann'}, false)).toEqual(['bob']);
    expect(nextKeys(['ann'], {field: {name: 'Assignee', kind: 'user'}, valueKey: null}, false)).toEqual([]);
  });
});

