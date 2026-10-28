import type {LayoutColumn} from '../model/layout';

/** Horizontal inset of a group box inside its track: margin plus border, in px. */
export const BOX_INSET = 5;

/** CSS width of one column track; collapsed columns use the narrow width. */
export const trackWidth = (column: LayoutColumn, collapsed: Set<string>): string =>
  collapsed.has(column.id) ? 'var(--col-c)' : 'var(--col-w)';

/** Width of the first-level swimlane column on two-level boards, in px. */
export const OUTER_WIDTH = 48;

/** grid-template-columns for a band: one track per column. */
export const bandTemplate = (columns: LayoutColumn[], collapsed: Set<string>): string =>
  columns.map(column => trackWidth(column, collapsed)).join(' ');

/** grid-template-columns for the column header; two-level boards get a corner track first. */
export const headerTemplate = (columns: LayoutColumn[], collapsed: Set<string>, twoLevel: boolean): string =>
  `${twoLevel ? 'var(--outer-w) ' : ''}${bandTemplate(columns, collapsed)}`;

/** Number of box insets already taken from each column track (by column index) in the containing grid. */
export type TrackInsets = Record<number, number>;

export type BoxTracks = {
  template: string;
  /** Insets per column index inside this box, to pass on to nested boxes. */
  insets: TrackInsets;
};

/**
 * grid-template-columns for the inside of a group box spanning `span`. The first and
 * last track give up this box's inset, on top of the insets the enclosing boxes already
 * took from the same tracks, so inner boundaries sit exactly on the row's grid lines.
 */
export const boxTracks = (span: LayoutColumn[], collapsed: Set<string>, containerInsets: TrackInsets = {}): BoxTracks => {
  const insets: TrackInsets = {};
  span.forEach((column, index) => {
    const isEdge = index === 0 || index === span.length - 1;
    insets[column.index] = (containerInsets[column.index] ?? 0) + (isEdge ? 1 : 0);
  });
  if (span.length === 1) {
    return {template: 'minmax(0, 1fr)', insets};
  }
  const template = span
    .map(column => {
      const width = trackWidth(column, collapsed);
      const inset = insets[column.index] * BOX_INSET;
      return inset > 0 ? `calc(${width} - ${inset}px)` : width;
    })
    .join(' ');
  return {template, insets};
};
