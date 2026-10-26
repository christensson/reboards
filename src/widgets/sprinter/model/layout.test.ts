import {describe, expect, it} from 'vitest';
import {type BoardConfig, UNCATEGORIZED_ROW_KEY, createEmptyBoard} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {type BoardLayout, type LayoutGroup, compositeRowKey, computeLayout, groupKey, packGroups} from './layout';

const rowOf = (layout: BoardLayout, key: string) => {
  const row = layout.rows.find(r => r.key === key);
  if (!row) {
    throw new Error(`row ${key} missing`);
  }
  return row;
};

const pf = (name: string, typeId: string, values: string[], $type = 'EnumBundle'): YtProjectCustomField => ({
  id: `pf-${name}`, $type: 'X', field: {id: `f-${name}`, name, fieldType: {id: typeId, valueType: typeId}},
  bundle: {id: 'b', $type, values: values.map((v, i) => ({id: `v-${i}`, name: v, ordinal: i}))}
});

const universe = buildFieldUniverse([[
  pf('State', 'state[1]', ['Open', 'In Progress', 'Review', 'Done', 'Duplicate'], 'StateBundle'),
  pf('Priority', 'enum[1]', ['Critical', 'Major', 'Normal'])
]]);

const config = (): BoardConfig => ({
  ...createEmptyBoard('me'),
  id: 'b', name: 'B', projects: [{id: '0-1', shortName: 'SP'}],
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'wip', values: ['In Progress', 'Review']}, {id: 'done', values: ['Done']}],
  ignoredValues: ['Duplicate'],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Critical', 'Major', 'Normal']}
});

type Spec = {id: string; state: string; priority?: string; parents?: string[]; children?: string[]};
const issue = ({id, state, priority, parents = [], children = []}: Spec): BoardIssue => ({
  id, idReadable: `SP-${id}`, summary: `Issue ${id}`, projectId: '0-1', projectShortName: 'SP', number: Number(id), tags: [],
  fields: {
    State: {$type: 'StateIssueCustomField', key: state, label: state, labels: [state]},
    Priority: priority ? {$type: 'SingleEnumIssueCustomField', key: priority, label: priority, labels: [priority]} : null
  },
  links: [],
  parentIds: parents,
  childIds: children
});

describe('packGroups', () => {
  const box = (id: string, startIndex: number, endIndex: number): LayoutGroup =>
    ({key: id, parentIdReadable: id, startIndex, endIndex} as unknown as LayoutGroup);

  it('puts non-overlapping boxes side by side and overlapping ones on separate bands', () => {
    const bands = packGroups([box('SP-1', 0, 0), box('SP-2', 1, 3), box('SP-3', 0, 1), box('SP-4', 2, 2)]);
    expect(bands.map(band => band.map(g => g.key))).toEqual([['SP-1', 'SP-2'], ['SP-3', 'SP-4']]);
  });

  it('keeps a single box per band when every box overlaps', () => {
    const bands = packGroups([box('SP-1', 0, 2), box('SP-2', 1, 1)]);
    expect(bands.map(band => band.map(g => g.key))).toEqual([['SP-1'], ['SP-2']]);
  });
});

describe('computeLayout with two swimlane fields', () => {
  const twoLevelUniverse = buildFieldUniverse([[
    pf('State', 'state[1]', ['Open', 'Done'], 'StateBundle'),
    pf('Priority', 'enum[1]', ['Critical', 'Major']),
    pf('Type', 'enum[1]', ['Bug', 'Task', 'Epic'])
  ]]);
  const twoLevelConfig = (): BoardConfig => ({
    ...config(),
    columns: [{id: 'open', values: ['Open']}, {id: 'done', values: ['Done']}],
    ignoredValues: [],
    row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Critical', 'Major']},
    innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'custom', customOrder: ['Bug', 'Task', 'Epic']}
  });
  const typed = (spec: Spec & {type?: string}): BoardIssue => {
    const base = issue(spec);
    return {...base, fields: {...base.fields, Type: spec.type ? {$type: 'SingleEnumIssueCustomField', key: spec.type, label: spec.type, labels: [spec.type]} : null}};
  };

  it('nests inner swimlanes with issues under every outer value and adds picker rows', () => {
    const layout = computeLayout({
      issues: [typed({id: '1', state: 'Open', priority: 'Major', type: 'Task'}), typed({id: '2', state: 'Done', priority: 'Major', type: 'Bug'}),
        typed({id: '3', state: 'Open', priority: 'Major'}), typed({id: '4', state: 'Open', type: 'Bug'})],
      config: twoLevelConfig(), universe: twoLevelUniverse, parents: {}
    });
    expect(layout.twoLevel).toBe(true);
    expect(layout.outerRows.map(o => [o.key, o.issueCount])).toEqual([[UNCATEGORIZED_ROW_KEY, 1], ['Critical', 0], ['Major', 3]]);
    const majorRows = layout.outerRows[2].rowKeys.map(k => layout.rowsByKey[k]);
    expect(majorRows.map(r => [r.kind, r.label, r.innerValue])).toEqual([
      ['normal', 'Uncategorized', null], ['normal', 'Bug', 'Bug'], ['normal', 'Task', 'Task'], ['picker', 'Assign other swimlane…', null]
    ]);
    expect(majorRows[1].fullLabel).toBe('Major / Bug');
    expect(majorRows[1].outerValue).toBe('Major');
    expect(layout.outerRows[1].rowKeys.map(k => layout.rowsByKey[k].kind)).toEqual(['picker']);
    expect(layout.placement['2'].rowKey).toBe(compositeRowKey('Major', 'Bug'));
    expect(layout.rowsByKey[compositeRowKey('Major', 'Task')].looseByColumn.open).toEqual(['1']);
    expect(layout.rowsByKey[compositeRowKey(UNCATEGORIZED_ROW_KEY, 'Bug')].looseByColumn.open).toEqual(['4']);
    expect(layout.rows.filter(r => r.kind === 'picker')).toHaveLength(3);
  });

  it('keeps single-level boards without outer rows or picker rows', () => {
    const layout = computeLayout({issues: [issue({id: '1', state: 'Open', priority: 'Major'})], config: config(), universe, parents: {}});
    expect(layout.twoLevel).toBe(false);
    expect(layout.outerRows).toEqual([]);
    expect(layout.rows.every(r => r.kind === 'normal' && r.outerKey === null)).toBe(true);
    expect(layout.rowsByKey.Major.outerValue).toBe('Major');
    expect(layout.rowsByKey.Major.fullLabel).toBe('Major');
  });
});

describe('computeLayout', () => {
  it('places issues by column/row, hides ignored values and counts', () => {
    const layout = computeLayout({
      issues: [issue({id: '1', state: 'Open', priority: 'Major'}), issue({id: '2', state: 'Review', priority: 'Major'}),
        issue({id: '3', state: 'Duplicate', priority: 'Major'}), issue({id: '4', state: 'Done'})],
      config: config(), universe, parents: {}
    });
    expect(layout.hiddenIssueIds).toEqual(['3']);
    expect(layout.rows.map(r => r.key)).toEqual([UNCATEGORIZED_ROW_KEY, 'Critical', 'Major', 'Normal']);
    expect(layout.rows[0].looseByColumn.done).toEqual(['4']);
    expect(layout.rows[2].looseByColumn.open).toEqual(['1']);
    expect(layout.rows[2].looseByColumn.wip).toEqual(['2']);
    expect(layout.columns.map(c => c.count)).toEqual([1, 1, 1]);
    expect(layout.rows[2].issueCount).toBe(2);
    expect(layout.columns[1].label).toBe('In Progress / Review');
  });

  it('omits the Uncategorized row when every issue has a row value', () => {
    const layout = computeLayout({issues: [issue({id: '1', state: 'Open', priority: 'Major'})], config: config(), universe, parents: {}});
    expect(layout.rows.map(r => r.key)).toEqual(['Critical', 'Major', 'Normal']);
  });

  it('uses a single row when no row field is configured', () => {
    const cfg = {...config(), row: {field: null, sort: 'custom' as const, customOrder: []}};
    const layout = computeLayout({issues: [issue({id: '1', state: 'Open', priority: 'Major'})], config: cfg, universe, parents: {}});
    expect(layout.rows.map(r => r.label)).toEqual(['All issues']);
    expect(layout.rows[0].looseByColumn.open).toEqual(['1']);
  });

  it('groups subtasks per parent and row with counts and group index', () => {
    const issues = [
      issue({id: '10', state: 'In Progress', priority: 'Major', children: ['11', '12', '13']}),
      issue({id: '11', state: 'Open', priority: 'Major', parents: ['10']}),
      issue({id: '12', state: 'Done', priority: 'Major', parents: ['10']}),
      issue({id: '13', state: 'Open', priority: 'Critical', parents: ['10']})
    ];
    const layout = computeLayout({issues, config: config(), universe, parents: {}});
    const critical = rowOf(layout, 'Critical');
    const major = rowOf(layout, 'Major');
    expect(critical.groups).toHaveLength(1);
    expect(critical.groups[0]).toMatchObject({parentIdReadable: 'SP-10', n: 1, m: 3, groupIndex: 1, groupTotal: 2, parentInThisRow: false, parentOnBoard: true, parentColumnId: 'wip', parentRowKey: 'Major', parentRowLabel: 'Major', startIndex: 0, endIndex: 0});
    expect(major.groups[0]).toMatchObject({n: 2, m: 3, groupIndex: 2, groupTotal: 2, parentInThisRow: true, startIndex: 0, endIndex: 2, childrenInOtherRows: 1, childrenOffBoard: 0});
    expect(critical.groups[0]).toMatchObject({childrenInOtherRows: 2, childrenOffBoard: 0});
    expect(major.groups[0].membersByColumn).toEqual({open: ['11'], done: ['12']});
    expect(major.looseByColumn.wip).toEqual([]);
    expect(layout.placement['10'].groupKey).toBe(groupKey('10', 'Major'));
    expect(layout.placement['13'].groupKey).toBe(groupKey('10', 'Critical'));
    expect(major.issueCount).toBe(3);
  });

  it('uses parent info for parents that are not on the board', () => {
    const issues = [issue({id: '21', state: 'Open', priority: 'Major', parents: ['20']})];
    const layout = computeLayout({issues, config: config(), universe, parents: {'20': {id: '20', idReadable: 'SP-20', summary: 'Epic', childCount: 5}}});
    const group = rowOf(layout, 'Major').groups[0];
    expect(group).toMatchObject({parentIdReadable: 'SP-20', parentSummary: 'Epic', parentOnBoard: false, n: 1, m: 5, groupTotal: 1, childrenInOtherRows: 0, childrenOffBoard: 4});
  });

  it('nests the box of a mid-level issue inside its parent box', () => {
    const issues = [
      issue({id: '30', state: 'Open', priority: 'Major', children: ['31']}),
      issue({id: '31', state: 'Open', priority: 'Major', parents: ['30', '99'], children: ['32']}),
      issue({id: '32', state: 'Done', priority: 'Major', parents: ['31']})
    ];
    const layout = computeLayout({issues, config: config(), universe, parents: {}});
    const major = rowOf(layout, 'Major');
    expect(major.groups.map(g => g.parentIdReadable)).toEqual(['SP-30']);
    const epic = major.groups[0];
    expect(epic.memberIds).toEqual([]);
    expect(epic.children.map(g => g.parentIdReadable)).toEqual(['SP-31']);
    expect(epic.children[0]).toMatchObject({depth: 1, parentGroupKey: epic.key, memberIds: ['32'], parentInThisRow: true, startIndex: 0, endIndex: 2});
    expect(epic).toMatchObject({depth: 0, n: 1, m: 1, startIndex: 0, endIndex: 2});
    expect(epic.allIdsByColumn).toEqual({open: ['30', '31'], done: ['32']});
    expect(layout.placement['31'].groupKey).toBe(groupKey('31', 'Major'));
    expect(layout.placement['32'].groupKey).toBe(groupKey('31', 'Major'));
    expect(layout.groupAncestors[groupKey('31', 'Major')]).toEqual([epic.key]);
    expect(major.looseByColumn.open).toEqual([]);
  });

  it('lays out an epic with stories and tasks across rows', () => {
    const issues = [
      issue({id: '1', state: 'In Progress', priority: 'Major', children: ['2', '3', '4']}),
      issue({id: '2', state: 'Open', priority: 'Major', parents: ['1'], children: ['5', '6']}),
      issue({id: '3', state: 'Done', priority: 'Major', parents: ['1'], children: ['7']}),
      issue({id: '4', state: 'Open', priority: 'Major', parents: ['1']}),
      issue({id: '5', state: 'Open', priority: 'Major', parents: ['2']}),
      issue({id: '6', state: 'Done', priority: 'Major', parents: ['2']}),
      issue({id: '7', state: 'Open', priority: 'Critical', parents: ['3']})
    ];
    const layout = computeLayout({issues, config: config(), universe, parents: {}});
    const major = rowOf(layout, 'Major');
    expect(major.groups).toHaveLength(1);
    const epic = major.groups[0];
    // SP-3's only task lives in another row, so SP-3 is a plain member here; SP-2 gets a nested box.
    expect(epic.memberIds).toEqual(['3', '4']);
    expect(epic.children.map(g => g.parentIdReadable)).toEqual(['SP-2']);
    expect(epic.n).toBe(3);
    expect(Object.fromEntries(Object.entries(epic.allIdsByColumn).map(([k, v]) => [k, [...v].sort()]))).toEqual({wip: ['1'], open: ['2', '4', '5'], done: ['3', '6']});
    expect(epic.children[0]).toMatchObject({memberIds: ['5', '6'], parentInThisRow: true, startIndex: 0, endIndex: 2, n: 2, m: 2});
    const critical = rowOf(layout, 'Critical');
    expect(critical.groups[0]).toMatchObject({parentIdReadable: 'SP-3', depth: 0, parentInThisRow: false, memberIds: ['7'], groupIndex: 1, groupTotal: 1});
  });
});
