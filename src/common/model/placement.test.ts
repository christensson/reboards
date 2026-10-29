import {describe, expect, it} from 'vitest';
import {type BoardConfig, createEmptyBoard, defaultDynamicOptions} from './board-config';
import {placeIssue} from './placement';

const board = (changes: Partial<BoardConfig> = {}): BoardConfig => ({
  ...createEmptyBoard('me'),
  columnField: {name: 'State', kind: 'state'},
  columns: [{id: 'a', values: ['Open']}, {id: 'b', values: ['In Progress', 'Review'], name: 'Doing'}],
  ignoredValues: ['Duplicate'],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: [], dynamic: defaultDynamicOptions()},
  ...changes
});

describe('placeIssue', () => {
  it('finds the configured column of a value and the swimlane', () => {
    expect(placeIssue(board(), {State: ['Review'], Priority: ['Major']})).toEqual({columns: ['Doing'], swimlanes: ['Major'], innerSwimlanes: null});
    expect(placeIssue(board(), {State: ['Duplicate']}).columns).toEqual([]);
    expect(placeIssue(board(), {State: ['Open']}).swimlanes).toEqual(['Uncategorized']);
  });

  it('makes a lane per value for fields whose lanes are their values, "No <field>" when empty', () => {
    const versions = board({columnField: {name: 'Fix versions', kind: 'version'}, columns: [], row: {...board().row, field: null}});
    expect(placeIssue(versions, {'Fix versions': ['1.0', '2.0']})).toEqual({columns: ['1.0', '2.0'], swimlanes: null, innerSwimlanes: null});
    expect(placeIssue(versions, {}).columns).toEqual(['No Fix versions']);
    expect(placeIssue(board({columnField: null}), {}).columns).toEqual(['All issues']);
  });
});
