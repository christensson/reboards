import {describe, expect, it} from 'vitest';
import type {GanttIssueRow, GanttRow, GanttUndatedRow} from './gantt';
import type {BoardIssue} from './issue';
import {collapseLevel, currentIndex, expandLevel, firstChildIndex, nextRootIndex, parentRowIndex, rowIndexOf, stepIn, stepOut, stepVertical} from './ganttNav';

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

describe('collapse and expand one level', () => {
  // A: 1 -> 2 -> 3 (three levels), B: 4 -> 5 (two levels)
  const tree = (collapsed: string[]): GanttRow[] => {
    const open = (id: string) => !collapsed.includes(id);
    const list: GanttRow[] = [issueRow('1', 0, {childCount: 1, collapsed: !open('1')})];
    if (open('1')) {
      list.push(issueRow('2', 1, {childCount: 1, collapsed: !open('2')}));
      if (open('2')) {
        list.push(issueRow('3', 2));
      }
    }
    list.push(issueRow('4', 0, {childCount: 1, collapsed: !open('4')}));
    if (open('4')) {
      list.push(issueRow('5', 1), undatedRow('4', 1, true), issueRow('6', 1, {timed: false}));
    }
    return list;
  };

  it('collapses the deepest expanded level each time', () => {
    expect(collapseLevel(tree([]))).toEqual(['2']);
    expect(collapseLevel(tree(['2']))).toEqual(['1', '4']);
    expect(collapseLevel(tree(['1', '2', '4']))).toEqual([]);
  });

  it('expands the shallowest collapsed level each time', () => {
    expect(expandLevel(tree(['1', '2', '4']))).toEqual(['1', '4']);
    expect(expandLevel(tree(['2']))).toEqual(['2']);
    expect(expandLevel(tree([]))).toEqual([]);
  });
});
