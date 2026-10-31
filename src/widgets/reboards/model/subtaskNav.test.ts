import {describe, expect, it} from 'vitest';
import {type BoardConfig, createEmptyBoard, defaultDynamicOptions} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {computeLayout, orderOnBoard} from './layout';
import {navParent, navStatus, siblingStep} from './subtaskNav';

const pf = (name: string, typeId: string, values: string[], $type = 'EnumBundle'): YtProjectCustomField => ({
  id: `pf-${name}`, $type: 'X', field: {id: `f-${name}`, name, fieldType: {id: typeId, valueType: typeId}},
  bundle: {id: 'b', $type, values: values.map((v, i) => ({id: `v-${i}`, name: v, ordinal: i}))}
});

const universe = buildFieldUniverse([[
  pf('State', 'state[1]', ['Open', 'In Progress', 'Done'], 'StateBundle'),
  pf('Priority', 'enum[1]', ['Major', 'Normal'])
]]);

const config = (): BoardConfig => ({
  ...createEmptyBoard('me'),
  id: 'b', name: 'B', projects: [{id: '0-1', shortName: 'SP'}],
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'wip', values: ['In Progress']}, {id: 'done', values: ['Done']}],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Major', 'Normal'], dynamic: defaultDynamicOptions()}
});

type Spec = {id: string; state: string; priority: string; parents?: string[]; children?: string[]};
const issue = ({id, state, priority, parents = [], children = []}: Spec): BoardIssue => ({
  id, idReadable: `SP-${id}`, summary: `Issue ${id}`, projectId: '0-1', projectShortName: 'SP', number: Number(id), tags: [],
  fields: {
    State: {$type: 'StateIssueCustomField', key: state, label: state, labels: [state], keys: [state]},
    Priority: {$type: 'SingleEnumIssueCustomField', key: priority, label: priority, labels: [priority], keys: [priority]}
  },
  links: [],
  parentIds: parents,
  childIds: children
});

// Epic 1 (also parent 9, not on the board) has subtasks 2, 3 and 4 (and 5, not on the board); 4 also has parent 6.
const issues = [
  issue({id: '1', state: 'Open', priority: 'Normal', children: ['2', '3', '4', '5']}),
  issue({id: '2', state: 'Done', priority: 'Major', parents: ['1']}),
  issue({id: '3', state: 'In Progress', priority: 'Major', parents: ['1']}),
  issue({id: '4', state: 'Open', priority: 'Normal', parents: ['6', '1']}),
  issue({id: '6', state: 'Open', priority: 'Normal', children: ['4']}),
  issue({id: '7', state: 'Open', priority: 'Normal', parents: ['9']})
];
const byId = new Map(issues.map(i => [i.id, i]));
const layout = computeLayout({issues, config: config(), universe, parents: {}});

describe('orderOnBoard', () => {
  it('orders by swimlane, then column, and leaves out issues not on the board', () => {
    expect(orderOnBoard(layout, ['2', '3', '4', '5'])).toEqual(['3', '2', '4']);
  });
});

describe('siblingStep', () => {
  it('steps through the subtasks in board order, wrapping around both ways', () => {
    expect(siblingStep(layout, byId.get('1'), '3', 1)).toBe('2');
    expect(siblingStep(layout, byId.get('1'), '2', 1)).toBe('4');
    expect(siblingStep(layout, byId.get('1'), '4', 1)).toBe('3');
    expect(siblingStep(layout, byId.get('1'), '3', -1)).toBe('4');
  });

  it('goes nowhere without another subtask or a parent', () => {
    expect(siblingStep(layout, byId.get('6'), '4', 1)).toBeNull();
    expect(siblingStep(layout, undefined, '1', 1)).toBeNull();
  });
});

describe('navParent', () => {
  it('prefers the parent navigated through, else the first parent on the board', () => {
    expect(navParent(byId.get('4'), layout, '1')).toBe('1');
    expect(navParent(byId.get('4'), layout, null)).toBe('6');
    expect(navParent(byId.get('4'), layout, '2')).toBe('6');
  });

  it('is null when no parent is on the board', () => {
    expect(navParent(byId.get('7'), layout, null)).toBeNull();
    expect(navParent(byId.get('1'), layout, null)).toBeNull();
  });
});

describe('navStatus', () => {
  it('describes the place among the parent\'s subtasks and the own subtasks', () => {
    expect(navStatus(layout, byId, '2', '1')).toBe('SP-2: Subtask 2 of 3 with parent SP-1.');
    expect(navStatus(layout, byId, '1', null)).toBe('SP-1: 3 subtasks.');
    expect(navStatus(layout, byId, '6', null)).toBe('SP-6: 1 subtask.');
    expect(navStatus(layout, byId, '7', null)).toBe('SP-7.');
  });
});
