import {describe, expect, it} from 'vitest';
import {type BoardConfig, UNCATEGORIZED_ROW_KEY, createEmptyBoard} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {groupDragHint, issueDragHint} from './dragHint';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutGroup, LayoutRow} from './layout';

const pf = (name: string, typeId: string, values: string[], $type = 'EnumBundle'): YtProjectCustomField => ({
  id: `pf-${name}`, $type: 'X', field: {id: `f-${name}`, name, fieldType: {id: typeId, valueType: typeId}},
  bundle: {id: 'b', $type, values: values.map((v, i) => ({id: `v-${i}`, name: v, ordinal: i}))}
});
const universe = buildFieldUniverse([[pf('State', 'state[1]', ['Open', 'In Progress', 'Review', 'Done'], 'StateBundle'), pf('Priority', 'enum[1]', ['Major', 'Minor'])]]);
const board: BoardConfig = {
  ...createEmptyBoard('me'),
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'wip', values: ['In Progress', 'Review']}, {id: 'done', values: ['Done']}],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: []}
};
const issue: BoardIssue = {id: '1', idReadable: 'SP-1', summary: '', projectId: '', projectShortName: 'SP', number: 1, tags: [], fields: {}, links: [], parentIds: [], childIds: []};

describe('issueDragHint', () => {
  it('describes one or two field changes', () => {
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Major', columnId: 'done'})).toBe('Set SP-1 State to Done.');
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Minor', columnId: 'done'})).toBe('Set SP-1 State to Done and Priority to Minor.');
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, {rowKey: UNCATEGORIZED_ROW_KEY, columnId: 'open'})).toBe('Set SP-1 Priority to empty.');
  });

  it('mentions the choice for combined columns and the no-change case', () => {
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Major', columnId: 'wip'})).toBe('Set SP-1 State to one of In Progress / Review (choose on drop).');
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, {rowKey: 'Major', columnId: 'open'})).toBe('SP-1: no change');
    expect(issueDragHint(board, universe, issue, {rowKey: 'Major', columnId: 'open'}, null)).toBe('Drop SP-1 on a cell');
  });
});

describe('groupDragHint', () => {
  const rows = [{key: 'Major', label: 'Major'}, {key: 'Minor', label: 'Minor'}] as LayoutRow[];
  const group = {rowKey: 'Major', parentIdReadable: 'SP-9', parentInThisRow: true} as LayoutGroup;

  it('names the target swimlane', () => {
    expect(groupDragHint(group, 3, rows, {rowKey: 'Minor', columnId: 'x'})).toBe('Move SP-9 and its 3 subtasks to Minor swimlane');
    expect(groupDragHint({...group, parentInThisRow: false}, 2, rows, {rowKey: 'Minor', columnId: 'x'})).toBe('Move 2 subtasks of SP-9 to Minor swimlane');
    expect(groupDragHint(group, 3, rows, {rowKey: 'Major', columnId: 'x'})).toBe('Drop on another swimlane to move SP-9 and its 3 subtasks');
    expect(groupDragHint(group, 3, rows, null)).toBe('Drop on another swimlane to move SP-9 and its 3 subtasks');
  });
});
