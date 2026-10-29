import {describe, expect, it} from 'vitest';
import {type BoardConfig, UNCATEGORIZED_ROW_KEY, createEmptyBoard, defaultDynamicOptions} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {ASSIGN_COLUMN_ID, type BoardLayout, type LayoutGroup, NO_VALUE_COLUMN_ID, PICKER_ROW_SUFFIX, cardLocation, revealColumnIds, cardId, compositeRowKey, computeLayout, dynamicColumnId, groupKey, packGroups} from './layout';

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
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Critical', 'Major', 'Normal'], dynamic: defaultDynamicOptions()}
});

type Spec = {id: string; state: string; priority?: string; parents?: string[]; children?: string[]};
const issue = ({id, state, priority, parents = [], children = []}: Spec): BoardIssue => ({
  id, idReadable: `SP-${id}`, summary: `Issue ${id}`, projectId: '0-1', projectShortName: 'SP', number: Number(id), tags: [],
  fields: {
    State: {$type: 'StateIssueCustomField', key: state, label: state, labels: [state], keys: [state]},
    Priority: priority ? {$type: 'SingleEnumIssueCustomField', key: priority, label: priority, labels: [priority], keys: [priority]} : null
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
    row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Critical', 'Major'], dynamic: defaultDynamicOptions()},
    innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'custom', customOrder: ['Bug', 'Task', 'Epic'], dynamic: defaultDynamicOptions()}
  });
  const typed = (spec: Spec & {type?: string}): BoardIssue => {
    const base = issue(spec);
    return {...base, fields: {...base.fields, Type: spec.type ? {$type: 'SingleEnumIssueCustomField', key: spec.type, label: spec.type, labels: [spec.type], keys: [spec.type]} : null}};
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
      ['normal', 'Uncategorized', null], ['normal', 'Bug', 'Bug'], ['normal', 'Task', 'Task'], ['picker', 'Assign Type…', null]
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
    const cfg = {...config(), row: {field: null, sort: 'custom' as const, customOrder: [], dynamic: defaultDynamicOptions()}};
    const layout = computeLayout({issues: [issue({id: '1', state: 'Open', priority: 'Major'})], config: cfg, universe, parents: {}});
    expect(layout.rows.map(r => r.label)).toEqual(['All issues']);
    expect(layout.rows[0].looseByColumn.open).toEqual(['1']);
    expect(layout.noSwimlanes).toBe(true);
    expect(computeLayout({issues: [], config: config(), universe, parents: {}}).noSwimlanes).toBe(false);
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

describe('computeLayout with dynamic fields', () => {
  const users = (logins: string[]): YtProjectCustomField => ({
    id: 'pf-Assignee', $type: 'X', field: {id: 'f-Assignee', name: 'Assignee', fieldType: {id: 'user[1]', valueType: 'user'}},
    bundle: {id: 'b', $type: 'UserBundle', aggregatedUsers: logins.map(login => ({id: login, login, fullName: login.toUpperCase()}))}
  });
  const dynamicUniverse = buildFieldUniverse([[
    pf('State', 'state[1]', ['Open', 'Done'], 'StateBundle'),
    pf('Priority', 'enum[1]', ['Critical', 'Major']),
    users(['ann', 'bob', 'cid', 'dan', 'eve', 'fay', 'gus'])
  ]]);
  const assigned = (id: string, login: string | null, state = 'Open'): BoardIssue => {
    const base = issue({id, state, priority: 'Major'});
    const assignee = login ? {$type: 'SingleUserIssueCustomField', key: login, label: login.toUpperCase(), labels: [login.toUpperCase()], keys: [login]} : null;
    return {...base, fields: {...base.fields, Assignee: assignee}};
  };
  const byAssignee = (): BoardConfig => ({...config(), columnField: {name: 'Assignee', kind: 'user'}, columns: [], ignoredValues: []});
  const issues = ['ann', 'bob', 'cid', 'dan', 'eve', 'fay'].map((login, i) => assigned(String(i + 1), login));

  it('makes a column per assignee on the board, "No Assignee" first, limited to the default count', () => {
    const layout = computeLayout({issues: [...issues, assigned('9', null)], config: byAssignee(), universe: dynamicUniverse, parents: {}});
    expect(layout.columns.map(c => c.label)).toEqual(['No Assignee', 'ANN', 'BOB', 'CID', 'DAN', 'Assign Assignee…']);
    expect(layout.columns[0]).toMatchObject({id: NO_VALUE_COLUMN_ID, columnKey: null, values: []});
    // The rightmost column sets a value no issue has yet, so it is not one of the picker's columns.
    expect(layout.columns[5]).toMatchObject({id: ASSIGN_COLUMN_ID, assign: true, values: [], index: 5});
    expect(layout.availableColumns).toHaveLength(7);
    // Assignees without issues (gus) get no column; eve and fay are beyond the default five.
    expect(layout.availableColumns.filter(c => !c.visible).map(c => c.key)).toEqual(['eve', 'fay']);
    expect(layout.hiddenIssueIds.sort()).toEqual(['5', '6']);
  });

  it('shows the columns the user picked, in sort order', () => {
    const picked = [dynamicColumnId('fay'), dynamicColumnId('ann'), dynamicColumnId('gone')];
    const layout = computeLayout({issues, config: byAssignee(), universe: dynamicUniverse, parents: {}, visibleColumnIds: picked});
    expect(layout.columns.filter(c => !c.assign).map(c => c.columnKey)).toEqual(['ann', 'fay']);
    expect(layout.placement['1'].columnId).toBe(dynamicColumnId('ann'));
  });

  it('makes a swimlane per assignee on the board, "No Assignee" first, sorted descending', () => {
    const board = {...config(), row: {...config().row, field: {name: 'Assignee', kind: 'user' as const}, dynamic: {...defaultDynamicOptions(), sort: 'alphabetical-desc' as const}}};
    const layout = computeLayout({issues: [assigned('1', 'bob'), assigned('2', 'ann'), assigned('3', null)], config: board, universe: dynamicUniverse, parents: {}});
    expect(layout.rows.map(r => r.label)).toEqual(['No Assignee', 'BOB', 'ANN', 'Assign Assignee…']);
    expect(layout.rows[0].key).toBe(UNCATEGORIZED_ROW_KEY);
    expect(layout.rows[3]).toMatchObject({key: PICKER_ROW_SUFFIX, kind: 'picker', pickLevel: 'outer'});
  });

  it('ends a dynamic first-level swimlane field with an "Assign <field>…" group', () => {
    const board: BoardConfig = {
      ...config(),
      row: {...config().row, field: {name: 'Assignee', kind: 'user'}},
      innerRow: {...config().row, field: {name: 'Priority', kind: 'enum'}}
    };
    const layout = computeLayout({issues: [assigned('1', 'bob')], config: board, universe: dynamicUniverse, parents: {}});
    const last = layout.outerRows[layout.outerRows.length - 1];
    expect(layout.outerRows.map(o => o.label)).toEqual(['BOB', 'Assign Assignee…']);
    expect(last).toMatchObject({isPicker: true, issueCount: 0, rowKeys: [compositeRowKey(PICKER_ROW_SUFFIX, PICKER_ROW_SUFFIX)]});
    expect(layout.rowsByKey[last.rowKeys[0]]).toMatchObject({kind: 'picker', pickLevel: 'outer', outerValue: null});
    expect(layout.rowsByKey[compositeRowKey('bob', PICKER_ROW_SUFFIX)].pickLevel).toBe('inner');
  });

  it('takes the columns of an enum treated as a changing field from the issues, in field order', () => {
    const board: BoardConfig = {
      ...config(),
      columnField: {name: 'Priority', kind: 'enum'},
      columns: [],
      columnOptions: {...defaultDynamicOptions(), asDynamic: true, sort: 'order'},
      row: {...config().row, field: null}
    };
    const issuesByPriority = [issue({id: '1', state: 'Open', priority: 'Major'}), issue({id: '2', state: 'Open', priority: 'Critical'})];
    const layout = computeLayout({issues: issuesByPriority, config: board, universe: dynamicUniverse, parents: {}});
    expect(layout.columns.map(c => c.id)).toEqual([dynamicColumnId('Critical'), dynamicColumnId('Major'), ASSIGN_COLUMN_ID]);
  });

  it('adds no "Assign…" targets for stable fields', () => {
    const layout = computeLayout({issues, config: config(), universe: dynamicUniverse, parents: {}});
    expect(layout.columns.some(c => c.assign)).toBe(false);
    expect(layout.rows.some(r => r.kind === 'picker')).toBe(false);
  });
});

describe('computeLayout with a multi-value column field', () => {
  const versionField: YtProjectCustomField = {
    id: 'pf-Fix', $type: 'X', field: {id: 'f-Fix', name: 'Fix versions', fieldType: {id: 'version[*]', valueType: 'version'}},
    bundle: {id: 'b', $type: 'VersionBundle', values: [{id: '1', name: 'v1', ordinal: 0}, {id: '2', name: 'v2', ordinal: 1}]}
  };
  const versionUniverse = buildFieldUniverse([[pf('Priority', 'enum[1]', ['Major']), versionField]]);
  const board = (): BoardConfig => ({...config(), columnField: {name: 'Fix versions', kind: 'version'}, columns: [], ignoredValues: []});
  const withVersions = (id: string, keys: string[]): BoardIssue => {
    const base = issue({id, state: 'Open', priority: 'Major'});
    return {...base, fields: {...base.fields, 'Fix versions': {$type: 'MultiVersionIssueCustomField', key: keys[0], label: keys[0], labels: keys, keys}}};
  };

  it('shows an issue with two versions in both columns, the first as its primary card', () => {
    const layout = computeLayout({issues: [withVersions('1', ['v1', 'v2']), withVersions('2', ['v2'])], config: board(), universe: versionUniverse, parents: {}});
    expect(layout.columns.filter(c => !c.assign).map(c => [c.columnKey, c.count])).toEqual([['v1', 1], ['v2', 2]]);
    expect(layout.placement['1'].columnId).toBe(dynamicColumnId('v1'));
    const extra = cardId('1', dynamicColumnId('v2'), 'Major');
    expect(layout.cards[extra]).toEqual({issueId: '1', rowKey: 'Major', columnId: dynamicColumnId('v2')});
    expect(rowOf(layout, 'Major').looseByColumn[dynamicColumnId('v2')]).toEqual([extra, '2']);
    expect(rowOf(layout, 'Major').issueCount).toBe(3);
  });

  it('lists the cards of an issue shown more than once in display order, with their locations', () => {
    const layout = computeLayout({issues: [withVersions('1', ['v2', 'v1']), withVersions('2', ['v2'])], config: board(), universe: versionUniverse, parents: {}});
    const extra = cardId('1', dynamicColumnId('v1'), 'Major');
    expect(layout.copiesByIssue).toEqual({'1': [extra, '1']});
    expect(cardLocation(layout, extra)).toBe('v1');
  });
});


describe('revealColumnIds', () => {
  const columns = [
    {id: '__none__', label: 'No Assignee', values: [], index: 0, count: 1, columnKey: null},
    {id: 'v:ann', label: 'ANN', values: ['ann'], index: 1, count: 1, columnKey: 'ann'},
    {id: ASSIGN_COLUMN_ID, label: 'Assign Assignee…', values: [], index: 2, count: 0, assign: true}
  ];

  it('adds the column of an assigned value that is not shown', () => {
    expect(revealColumnIds(columns, ['bob'])).toEqual(['__none__', 'v:ann', 'v:bob']);
    expect(revealColumnIds(columns, ['ann', 'bob', 'cid'])).toEqual(['__none__', 'v:ann', 'v:bob', 'v:cid']);
    expect(revealColumnIds(columns.slice(1), [])).toEqual(['v:ann', '__none__']);
  });

  it('leaves shown and configured columns alone', () => {
    expect(revealColumnIds(columns, ['ann'])).toBeNull();
    expect(revealColumnIds([{id: 'open', label: 'Open', values: ['Open'], index: 0, count: 0}], ['Done'])).toBeNull();
  });
});

describe('computeLayout in the time layout', () => {
  const day = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const dateUniverse = buildFieldUniverse([[
    pf('State', 'state[1]', ['Open', 'In Progress', 'Review', 'Done'], 'StateBundle'),
    {id: 'pf-Due', $type: 'X', field: {id: 'f-Due', name: 'Due Date', fieldType: {id: 'date', valueType: 'date'}}}
  ]]);
  const due = (spec: Spec & {due?: string}): BoardIssue => {
    const base = issue(spec);
    const time = spec.due ? String(day(spec.due) + 12 * 3_600_000) : null;
    return {...base, fields: {...base.fields, 'Due Date': time ? {$type: 'DateIssueCustomField', key: time, label: time, labels: [time], keys: [time]} : null}};
  };
  const board = (sort: 'asc' | 'desc' = 'asc'): BoardConfig => ({
    ...config(),
    timeline: {...config().timeline, field: {name: 'Due Date', kind: 'date'}, sort},
    defaultRowMode: 'time'
  });
  const now = new Date(2026, 4, 10, 9).getTime();

  it('makes a row per date across columns, sorted, with the issues without a date last', () => {
    const issues = [
      due({id: '1', state: 'Open', due: '2026-05-12'}),
      due({id: '2', state: 'Done', due: '2026-05-12'}),
      due({id: '3', state: 'Open', due: '2026-05-01'}),
      due({id: '4', state: 'Open'})
    ];
    const layout = computeLayout({issues, config: board(), universe: dateUniverse, parents: {}, now});
    expect(layout.rowMode).toBe('time');
    expect(layout.rows.map(r => [r.kind, r.time, r.label])).toEqual([
      ['time', day('2026-05-01'), ''],
      ['time', day('2026-05-12'), ''],
      ['time', null, 'No Due Date']
    ]);
    // Same date, same row, in both columns; the row's line reaches the rightmost one.
    expect(layout.rows[1].looseByColumn).toMatchObject({open: ['1'], done: ['2']});
    expect(layout.rows[1].lastIndex).toBe(2);
    expect(layout.todayIndex).toBe(1);
    expect(layout.flagsByIssue).toEqual({'3': ['overdue', 'overdue-unassigned']});
    const newest = computeLayout({issues, config: board('desc'), universe: dateUniverse, parents: {}, now});
    expect(newest.rows.map(r => r.time)).toEqual([day('2026-05-12'), day('2026-05-01'), null]);
    expect(newest.todayIndex).toBe(1);
  });

  it('puts subtasks in their parent\'s row, sorted by their own date inside the box', () => {
    const issues = [
      due({id: '10', state: 'Open', due: '2026-06-01', children: ['11', '12']}),
      due({id: '11', state: 'Open', due: '2026-06-20', parents: ['10']}),
      due({id: '12', state: 'Open', due: '2026-05-20', parents: ['10']})
    ];
    const layout = computeLayout({issues, config: board(), universe: dateUniverse, parents: {}, now});
    expect(layout.rows.map(r => r.time)).toEqual([day('2026-06-01')]);
    expect(layout.rows[0].groups[0].memberIds).toEqual(['12', '11']);
    expect(layout.flagsByIssue['11']).toEqual(['planned-late']);
  });

  it('keeps the swimlanes when the swimlane layout is asked for', () => {
    const layout = computeLayout({issues: [due({id: '1', state: 'Open', priority: 'Major', due: '2026-05-12'})], config: board(), universe: dateUniverse, parents: {}, rowMode: 'swimlanes'});
    expect(layout.rows.map(r => r.kind)).toEqual(['normal']);
    expect(layout.flagsByIssue).toEqual({});
  });
});
