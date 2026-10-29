import type {BoardLayout} from './layout';
import type {MoveTarget} from './mutations';

export type Direction = 'left' | 'right' | 'up' | 'down';

const KEY_DIRECTIONS: Record<string, Direction> = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'};

export const directionOf = (key: string): Direction | null => KEY_DIRECTIONS[key] ?? null;

/** A card's place on screen. */
export type Box = {left: number; top: number; width: number; height: number};

/** Off-axis distance counts this much more than distance along the direction. */
const OFF_AXIS_WEIGHT = 2;

const center = (box: Box) => ({x: box.left + box.width / 2, y: box.top + box.height / 2});

/**
 * The card next to `from` in a direction: the closest one whose center lies that way, preferring
 * cards in line with it over ones further off to the side.
 */
export const nearestInDirection = (from: Box, candidates: {id: string; box: Box}[], direction: Direction): string | null => {
  const origin = center(from);
  let best: {id: string; score: number} | null = null;
  candidates.forEach(({id, box}) => {
    const point = center(box);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = {left: -dx, right: dx, up: -dy, down: dy}[direction];
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    // Only cards that way; a card exactly level with this one is neither left nor right of it.
    if (along <= 1) {
      return;
    }
    const score = along + OFF_AXIS_WEIGHT * across;
    if (!best || score < best.score) {
      best = {id, score};
    }
  });
  return (best as {id: string} | null)?.id ?? null;
};

export type Collapsed = {rows: Set<string>; columns: Set<string>; outerRows: Set<string>};

/** Steps through a list, staying at the ends; an item not in the list starts from the closest index. */
const stepIn = <T>(items: T[], current: T, fallbackIndex: number, step: number): T | undefined => {
  const at = items.indexOf(current);
  const from = at === -1 ? Math.min(Math.max(fallbackIndex, 0), items.length - 1) : at;
  return items[Math.min(Math.max(from + step, 0), items.length - 1)];
};

/**
 * Where a card being moved with Ctrl+arrows goes next: the column to the left or right, or the
 * row above or below. Collapsed columns and rows, "Assign…" columns and picker rows are skipped.
 */
export const stepTarget = (layout: BoardLayout, target: MoveTarget, direction: Direction, collapsed: Collapsed): MoveTarget => {
  if (direction === 'left' || direction === 'right') {
    const columns = layout.columns.filter(c => !c.assign && !collapsed.columns.has(c.id)).map(c => c.id);
    const index = layout.columns.find(c => c.id === target.columnId)?.index ?? 0;
    const columnId = stepIn(columns, target.columnId, index, direction === 'right' ? 1 : -1);
    return columnId ? {...target, columnId} : target;
  }
  const rows = layout.rows
    .filter(r => r.kind !== 'picker' && !collapsed.rows.has(r.key) && !(r.outerKey !== null && collapsed.outerRows.has(r.outerKey)))
    .map(r => r.key);
  const index = layout.rows.findIndex(r => r.key === target.rowKey);
  const rowKey = stepIn(rows, target.rowKey, index, direction === 'down' ? 1 : -1);
  return rowKey ? {...target, rowKey} : target;
};
