import type {BoardLayout} from './layout';

/** A swimlane navigation stops at: a row, or a collapsed or empty first-level swimlane as a whole. */
export type LaneStop = {
  key: string;
  kind: 'row' | 'outer';
  label: string;
  issueCount: number;
  /** The rows the stop covers; an "Assign …" drop row belongs to the stop above it. */
  rowKeys: string[];
};

/** Hands each "Assign …" drop row to the stop above it, so a click in one counts as that swimlane. */
const withPickerRows = (layout: BoardLayout, rowKeys: string[], stops: LaneStop[]): LaneStop[] => {
  rowKeys.forEach(key => {
    const last = stops[stops.length - 1];
    if (layout.rowsByKey[key]?.kind === 'picker' && last && !last.rowKeys.includes(key)) {
      last.rowKeys.push(key);
    }
  });
  return stops;
};

/**
 * The swimlanes shown, in board order: every row but the "Assign …" drop rows. A collapsed
 * first-level swimlane is one stop, and so is one that only holds its "Assign …" row (no issues).
 * Empty for a board without swimlanes.
 */
export const swimlaneStops = (layout: BoardLayout, collapsedOuterRows: Set<string>): LaneStop[] => {
  if (layout.noSwimlanes) {
    return [];
  }
  const rowStop = (key: string): LaneStop[] => {
    const row = layout.rowsByKey[key];
    return row && row.kind !== 'picker' ? [{key, kind: 'row', label: row.fullLabel, issueCount: row.issueCount, rowKeys: [key]}] : [];
  };
  if (!layout.twoLevel || layout.rowMode === 'time') {
    const stops: LaneStop[] = [];
    layout.rows.forEach(row => withPickerRows(layout, [row.key], stops).push(...rowStop(row.key)));
    return stops;
  }
  const stops: LaneStop[] = [];
  layout.outerRows.forEach(outer => {
    if (outer.isPicker) {
      return;
    }
    const inner = outer.rowKeys.flatMap(rowStop);
    if (collapsedOuterRows.has(outer.key) || inner.length === 0) {
      stops.push({key: outer.key, kind: 'outer', label: outer.label, issueCount: outer.issueCount, rowKeys: [...outer.rowKeys]});
    } else {
      stops.push(...inner);
      withPickerRows(layout, outer.rowKeys, stops);
    }
  });
  return stops;
};

/** The stop holding a row, or -1. */
export const stopIndexOfRow = (stops: LaneStop[], rowKey: string): number => stops.findIndex(stop => stop.rowKeys.includes(rowKey));

/**
 * The cards in a swimlane, by card id: first cards (id = issue id) and the further cards of issues
 * with several values of a multi-value field. None when the swimlane is collapsed.
 */
export const laneCardIds = (layout: BoardLayout, stop: LaneStop, collapsedRows: Set<string>): string[] => {
  if (stop.kind === 'outer' || collapsedRows.has(stop.key)) {
    return [];
  }
  return Object.keys(layout.cards).filter(id => layout.cards[id].rowKey === stop.key);
};

/** Cards whose tops differ by at most this many pixels count as level. */
const LEVEL_TOLERANCE = 4;

/**
 * The card closest to the swimlane header, and of those the leftmost: the smallest top (within a
 * few pixels), then the smallest left. Null without cards.
 */
export const topLeftCard = (cards: {id: string; top: number; left: number}[]): string | null => {
  if (cards.length === 0) {
    return null;
  }
  const top = Math.min(...cards.map(card => card.top));
  const level = cards.filter(card => card.top <= top + LEVEL_TOLERANCE);
  return level.reduce((best, card) => (card.left < best.left ? card : best)).id;
};

/** The banner's status: "Major / Anna: swimlane 3 of 12, 7 issues." */
export const laneStatus = (stops: LaneStop[], index: number): string => {
  const stop = stops[index];
  if (!stop) {
    return '';
  }
  const issues = `${stop.issueCount} ${stop.issueCount === 1 ? 'issue' : 'issues'}`;
  return `${stop.label}: swimlane ${index + 1} of ${stops.length}, ${issues}.`;
};
