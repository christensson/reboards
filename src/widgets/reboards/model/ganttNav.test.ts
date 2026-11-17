import {describe, expect, it} from 'vitest';
import type {GanttIssueRow, GanttRow, GanttUndatedRow} from './gantt';
import type {BoardIssue} from './issue';
import {currentIndex, firstChildIndex, nextRootIndex, parentRowIndex, rowIndexOf, stepIn, stepOut, stepVertical} from './ganttNav';

const issueRow = (id: string, depth: number, extra: Partial<GanttIssueRow> = {}): GanttIssueRow => ({
  type: 'issue',
  key: id,
  issue: {id, idReadable: `SAN-${id}`} as BoardIssue,
  depth,
  parentId: null,
  schedule: {spans: []},
  timed: true,
  childCount: 0,
  undatedChildIds: [],
  collapsed: false,
  workload: {pastEnd: false},
  overdue: false,
  overrun: false,
  early: false,
  late: false,
  ...extra
});
const undatedRow = (parentId: string | null, depth: number, expanded: boolean): GanttUndatedRow => ({
  type: 'undated', key: `undated:${parentId}`, parentId, depth, count: 1, expanded
});

// 1
//   2
//     3
//   (1 without time, shown)
//   5
// 6 (collapsed, has subtasks)
const rows: GanttRow[] = [
  issueRow('1', 0, {childCount: 1, undatedChildIds: ['5']}),
  issueRow('2', 1, {childCount: 1}),
  issueRow('3', 2),
  undatedRow('1', 1, true),
  issueRow('5', 1, {timed: false}),
  issueRow('6', 0, {childCount: 2, collapsed: true})
];

describe('gantt keyboard navigation', () => {
  it('finds rows and the row the keys start from', () => {
    expect(rowIndexOf(rows, '3')).toBe(2);
    expect(rowIndexOf(rows, 'x')).toBe(-1);
    expect(currentIndex(rows, null, new Set(['2', '5']))).toBe(4);
    expect(currentIndex(rows, 'undated:1', new Set(['2']))).toBe(3);
    expect(currentIndex(rows, '3', new Set(['2']))).toBe(1);
    expect(currentIndex(rows, null, new Set())).toBe(-1);
  });

  it('moves up and down, stopping at the ends', () => {
    expect(stepVertical(rows, -1, 1)).toEqual({to: 0});
    expect(stepVertical(rows, 0, -1)).toEqual({to: 0});
    expect(stepVertical(rows, 5, 1)).toEqual({to: 5});
    expect(stepVertical([], -1, 1)).toBeNull();
  });

  it('finds parents and first subtasks', () => {
    expect(parentRowIndex(rows, 2)).toBe(1);
    expect(parentRowIndex(rows, 4)).toBe(0);
    expect(parentRowIndex(rows, 0)).toBe(-1);
    expect(firstChildIndex(rows, 0)).toBe(1);
    expect(firstChildIndex(rows, 2)).toBe(-1);
    expect(firstChildIndex(rows, 5)).toBe(-1);
  });

  it('collapses, expands and walks the tree with left and right', () => {
    expect(stepIn(rows, 0)).toEqual({to: 1});
    expect(stepIn(rows, 5)).toBe('toggle');
    expect(stepIn(rows, 2)).toBeNull();
    expect(stepOut(rows, 0)).toBe('toggle');
    expect(stepOut(rows, 2)).toEqual({to: 1});
    expect(stepOut(rows, 3)).toBe('toggle');
    expect(stepOut(rows, 4)).toEqual({to: 0});
    expect(stepOut(rows, 5)).toBeNull();
  });

  it('steps between top-level issues', () => {
    expect(nextRootIndex(rows, 2, 1)).toBe(5);
    expect(nextRootIndex(rows, 5, 1)).toBe(-1);
    expect(nextRootIndex(rows, 2, -1)).toBe(0);
    expect(nextRootIndex(rows, -1, 1)).toBe(0);
    expect(nextRootIndex(rows, -1, -1)).toBe(5);
  });
});
