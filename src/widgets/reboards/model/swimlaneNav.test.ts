import {describe, expect, it} from 'vitest';
import {type BoardConfig, createEmptyBoard, defaultDynamicOptions} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {PICKER_ROW_SUFFIX, compositeRowKey, computeLayout} from './layout';
import {laneCardIds, laneStatus, stopIndexOfRow, swimlaneStops, topLeftCard} from './swimlaneNav';

const pf = (name: string, typeId: string, values: string[], $type = 'EnumBundle'): YtProjectCustomField => ({
  id: `pf-${name}`, $type: 'X', field: {id: `f-${name}`, name, fieldType: {id: typeId, valueType: typeId}},
  bundle: {id: 'b', $type, values: values.map((v, i) => ({id: `v-${i}`, name: v, ordinal: i}))}
});

const universe = buildFieldUniverse([[
  pf('State', 'state[1]', ['Open', 'Done'], 'StateBundle'),
  pf('Priority', 'enum[1]', ['Major', 'Normal', 'Minor']),
  pf('Type', 'enum[1]', ['Bug', 'Task'])
]]);

const config = (twoLevel = false): BoardConfig => ({
  ...createEmptyBoard('me'),
  id: 'b', name: 'B', projects: [{id: '0-1', shortName: 'SP'}],
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'done', values: ['Done']}],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: ['Major', 'Normal', 'Minor'], dynamic: defaultDynamicOptions()},
  ...(twoLevel ? {innerRow: {field: {name: 'Type', kind: 'enum'}, sort: 'custom', customOrder: ['Bug', 'Task'], dynamic: defaultDynamicOptions()}} : {})
});

const enumField = (value: string) => ({$type: 'SingleEnumIssueCustomField', key: value, label: value, labels: [value], keys: [value]});
const issue = (id: string, state: string, priority: string, type: string): BoardIssue => ({
  id, idReadable: `SP-${id}`, summary: `Issue ${id}`, projectId: '0-1', projectShortName: 'SP', number: Number(id), tags: [],
  fields: {
    State: {$type: 'StateIssueCustomField', key: state, label: state, labels: [state], keys: [state]},
    Priority: enumField(priority),
    Type: enumField(type)
  },
  links: [],
  parentIds: [],
  childIds: []
});

const issues = [issue('1', 'Done', 'Major', 'Bug'), issue('2', 'Open', 'Major', 'Bug'), issue('3', 'Open', 'Normal', 'Task'), issue('4', 'Open', 'Major', 'Task')];

describe('swimlaneStops', () => {
  it('lists the swimlanes of a single-level board in order', () => {
    const layout = computeLayout({issues, config: config(), universe, parents: {}});
    const stops = swimlaneStops(layout, new Set());
    expect(stops.map(s => [s.key, s.issueCount])).toEqual([['Major', 3], ['Normal', 1], ['Minor', 0]]);
    expect(stopIndexOfRow(stops, 'Normal')).toBe(1);
  });

  it('lists inner swimlanes without picker rows, and a collapsed or empty first-level swimlane as one stop', () => {
    const layout = computeLayout({issues, config: config(true), universe, parents: {}});
    const stops = swimlaneStops(layout, new Set());
    expect(stops.map(s => [s.kind, s.label])).toEqual([['row', 'Major / Bug'], ['row', 'Major / Task'], ['row', 'Normal / Task'], ['outer', 'Minor']]);
    // A click in an "Assign …" row counts as the swimlane above it.
    expect(stopIndexOfRow(stops, compositeRowKey('Major', PICKER_ROW_SUFFIX))).toBe(1);
    const collapsed = swimlaneStops(layout, new Set(['Major']));
    expect(collapsed.map(s => [s.kind, s.label])).toEqual([['outer', 'Major'], ['row', 'Normal / Task'], ['outer', 'Minor']]);
    expect(stopIndexOfRow(collapsed, compositeRowKey('Major', 'Task'))).toBe(0);
  });

  it('has no stops without swimlanes', () => {
    const layout = computeLayout({issues, config: {...config(), row: {...config().row, field: null}}, universe, parents: {}});
    expect(swimlaneStops(layout, new Set())).toEqual([]);
  });
});

describe('laneCardIds', () => {
  const layout = computeLayout({issues, config: config(), universe, parents: {}});
  const stops = swimlaneStops(layout, new Set());

  it('lists the cards of a swimlane, none when it is collapsed', () => {
    expect(laneCardIds(layout, stops[0], new Set()).sort()).toEqual(['1', '2', '4']);
    expect(laneCardIds(layout, stops[0], new Set(['Major']))).toEqual([]);
  });
});

describe('topLeftCard', () => {
  it('picks the card nearest the top, then the leftmost of those level with it', () => {
    expect(topLeftCard([{id: 'a', top: 130, left: 10}, {id: 'b', top: 102, left: 300}, {id: 'c', top: 100, left: 600}])).toBe('b');
    expect(topLeftCard([{id: 'a', top: 140, left: 10}, {id: 'b', top: 100, left: 300}])).toBe('b');
  });

  it('picks nothing without cards', () => {
    expect(topLeftCard([])).toBeNull();
  });
});

describe('laneStatus', () => {
  it('names the swimlane, its place and its issues', () => {
    const layout = computeLayout({issues, config: config(), universe, parents: {}});
    const stops = swimlaneStops(layout, new Set());
    expect(laneStatus(stops, 0)).toBe('Major: swimlane 1 of 3, 3 issues.');
    expect(laneStatus(stops, 1)).toBe('Normal: swimlane 2 of 3, 1 issue.');
  });
});
