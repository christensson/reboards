import type {GanttRow} from './gantt';

/** Keyboard navigation of the Gantt chart's rows, a tree: pure functions over the visible rows. */

export const isExpandable = (row: GanttRow): boolean => row.type === 'undated' || row.childCount > 0 || row.undatedChildIds.length > 0;
export const isExpanded = (row: GanttRow): boolean => (row.type === 'undated' ? row.expanded : !row.collapsed);

/** What a key does: go to a row, expand or collapse the current one, or nothing. */
export type Step = {to: number} | 'toggle' | null;

/** The row of an issue; -1 when it is not shown. */
export const rowIndexOf = (rows: GanttRow[], issueId: string): number => rows.findIndex(row => row.type === 'issue' && row.issue.id === issueId);

/**
 * The row the keys start from: the keyboard cursor's row while it is a "without time" row or a
 * selected issue, else the row of the last selected issue; -1 for none.
 */
export const currentIndex = (rows: GanttRow[], cursor: string | null, selectedIds: Set<string>): number => {
  const at = cursor === null ? -1 : rows.findIndex(row => row.key === cursor);
  const row = rows[at];
  if (row && (row.type === 'undated' || selectedIds.has(row.issue.id))) {
    return at;
  }
  const last = Array.from(selectedIds).pop();
  return last === undefined ? -1 : rowIndexOf(rows, last);
};

/** The row of the parent: the nearest row above, one level up; -1 at the top level. */
export const parentRowIndex = (rows: GanttRow[], at: number): number => {
  const depth = rows[at]?.depth ?? 0;
  for (let index = at - 1; index >= 0; index--) {
    if (rows[index].depth < depth) {
      return rows[index].depth === depth - 1 ? index : -1;
    }
  }
  return -1;
};

/** The row of the first subtask, when the row is expanded; -1 otherwise. */
export const firstChildIndex = (rows: GanttRow[], at: number): number =>
  at >= 0 && at + 1 < rows.length && rows[at + 1].depth > rows[at].depth ? at + 1 : -1;

/** Right: expand, else go to the first subtask. */
export const stepIn = (rows: GanttRow[], at: number): Step => {
  const row = rows[at];
  if (!row || !isExpandable(row)) {
    return null;
  }
  if (!isExpanded(row)) {
    return 'toggle';
  }
  const child = firstChildIndex(rows, at);
  return child >= 0 ? {to: child} : null;
};

/** Left: collapse, else go to the parent. */
export const stepOut = (rows: GanttRow[], at: number): Step => {
  const row = rows[at];
  if (!row) {
    return null;
  }
  if (isExpandable(row) && isExpanded(row)) {
    return 'toggle';
  }
  const parent = parentRowIndex(rows, at);
  return parent >= 0 ? {to: parent} : null;
};

/** Up and down move one row, stopping at the ends; with no current row they go to the first. */
export const stepVertical = (rows: GanttRow[], at: number, direction: 1 | -1): Step => {
  if (rows.length === 0) {
    return null;
  }
  if (at < 0) {
    return {to: 0};
  }
  return {to: Math.min(rows.length - 1, Math.max(0, at + direction))};
};

/** S and Shift+S: the next or previous top-level issue; with no current row the first or the last. */
export const nextRootIndex = (rows: GanttRow[], at: number, direction: 1 | -1): number => {
  const isRoot = (row: GanttRow) => row.type === 'issue' && row.depth === 0;
  if (direction > 0) {
    const index = rows.findIndex((row, i) => i > at && isRoot(row));
    return index;
  }
  for (let index = (at < 0 ? rows.length : at) - 1; index >= 0; index--) {
    if (isRoot(rows[index])) {
      return index;
    }
  }
  return -1;
};

/** Ids of the issue rows in `rows` at the greatest (or smallest) depth among them. */
const atDepth = (rows: GanttRow[], pick: (a: number, b: number) => number): string[] => {
  if (rows.length === 0) {
    return [];
  }
  const depth = rows.map(row => row.depth).reduce((a, b) => pick(a, b));
  return rows.flatMap(row => (row.type === 'issue' && row.depth === depth ? [row.issue.id] : []));
};

/**
 * "Collapse one level": the expanded parents at the greatest depth, so every tree shows one level
 * less, down to the depth of the shallowest. "Without time" rows hide with their parent.
 */
export const collapseLevel = (rows: GanttRow[]): string[] =>
  atDepth(rows.filter((row, index) => row.type === 'issue' && isExpandable(row) && isExpanded(row) && rows[index + 1]?.depth > row.depth), Math.max);

/** "Expand one level": the collapsed parents at the smallest depth. */
export const expandLevel = (rows: GanttRow[]): string[] =>
  atDepth(rows.filter(row => row.type === 'issue' && isExpandable(row) && !isExpanded(row)), Math.min);
