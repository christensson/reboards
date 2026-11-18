import type {BoardLayout, LayoutGroup} from './layout';

export type CollapsedState = {
  rows: Set<string>;
  outerRows: Set<string>;
  columns: Set<string>;
  groups: Set<string>;
};

/** True when the box or any box enclosing it is collapsed. */
export const isGroupCollapsed = (layout: BoardLayout, groupKey: string | undefined, collapsedGroups: Set<string>): boolean =>
  Boolean(groupKey) && [...(layout.groupAncestors[groupKey ?? ''] ?? []), groupKey ?? ''].some(key => collapsedGroups.has(key));

/** Ids of the placed issues whose card is actually rendered (nothing enclosing them is collapsed). */
export const visibleIssueIds = (layout: BoardLayout, collapsed: CollapsedState): Set<string> => {
  const ids = new Set<string>();
  Object.entries(layout.placement).forEach(([id, p]) => {
    const outerKey = layout.rowsByKey[p.rowKey]?.outerKey ?? null;
    if (collapsed.rows.has(p.rowKey) || collapsed.columns.has(p.columnId)) {
      return;
    }
    if (outerKey !== null && collapsed.outerRows.has(outerKey)) {
      return;
    }
    if (isGroupCollapsed(layout, p.groupKey, collapsed.groups)) {
      return;
    }
    ids.add(id);
  });
  return ids;
};

/** What hides subtask boxes: collapsed swimlanes (both levels) and collapsed boxes. */
export type GroupLevelState = Pick<CollapsedState, 'rows' | 'outerRows' | 'groups'>;

/** The subtask boxes that are rendered: in open swimlanes, inside open boxes. */
const shownGroups = (layout: BoardLayout, state: GroupLevelState): LayoutGroup[] => {
  const shown: LayoutGroup[] = [];
  const walk = (groups: LayoutGroup[]): void => groups.forEach(group => {
    shown.push(group);
    if (!state.groups.has(group.key)) {
      walk(group.children);
    }
  });
  layout.rows.forEach(row => {
    if (!state.rows.has(row.key) && !(row.outerKey && state.outerRows.has(row.outerKey))) {
      walk(row.groups);
    }
  });
  return shown;
};

const keysAtDepth = (groups: LayoutGroup[], pick: (a: number, b: number) => number): string[] => {
  if (groups.length === 0) {
    return [];
  }
  const depth = groups.map(group => group.depth).reduce((a, b) => pick(a, b));
  return Array.from(new Set(groups.filter(group => group.depth === depth).map(group => group.key)));
};

/** "Collapse one level": the open boxes nested deepest, so every box tree shows one level less. */
export const collapseGroupLevel = (layout: BoardLayout, state: GroupLevelState): string[] =>
  keysAtDepth(shownGroups(layout, state).filter(group => !state.groups.has(group.key)), Math.max);

/** "Expand one level": the collapsed boxes nested least deep. */
export const expandGroupLevel = (layout: BoardLayout, state: GroupLevelState): string[] =>
  keysAtDepth(shownGroups(layout, state).filter(group => state.groups.has(group.key)), Math.min);
