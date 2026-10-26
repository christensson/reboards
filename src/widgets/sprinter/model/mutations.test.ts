import {describe, expect, it} from 'vitest';
import {type BoardConfig, UNCATEGORIZED_ROW_KEY, createEmptyBoard} from '@/common/model/board-config';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {applyChanges, planMove} from './mutations';

const config: BoardConfig = {
  ...createEmptyBoard('me'),
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'open', values: ['Open']}, {id: 'wip', values: ['In Progress', 'Review']}],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: []}
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

describe('applyChanges', () => {
  it('updates fields using universe metadata', () => {
    const universe = buildFieldUniverse([[{
      id: 'pf', $type: 'X', field: {id: 'f', name: 'State', fieldType: {id: 'state[1]', valueType: 'state'}},
      bundle: {id: 'b', $type: 'StateBundle', values: [{id: 'v', name: 'Open', isResolved: false, color: {background: '#1', foreground: '#2'}}]}
    }]]);
    const issue: BoardIssue = {
      id: '1', idReadable: 'SP-1', summary: '', projectId: '', projectShortName: 'SP', number: 1, tags: [], links: [], parentIds: [], childIds: [],
      fields: {State: {$type: 'StateIssueCustomField', key: 'Done', label: 'Done', labels: ['Done']}}
    };
    const updated = applyChanges(issue, [{field: {name: 'State', kind: 'state'}, valueKey: 'Open'}, {field: {name: 'Priority', kind: 'enum'}, valueKey: null}], universe);
    expect(updated.fields.State).toEqual({$type: 'StateIssueCustomField', key: 'Open', label: 'Open', labels: ['Open'], color: {background: '#1', foreground: '#2'}, isResolved: false});
    expect(updated.fields.Priority).toBeNull();
    expect(issue.fields.State?.key).toBe('Done');
  });
});
