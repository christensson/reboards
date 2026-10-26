import type {BoardLayout} from './layout';

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
