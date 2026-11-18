import type {CardSize} from '@/common/storage/prefs';
import {type GanttIssueRow, type Span, detailedSpan} from '../../model/gantt';
import {type GanttScale, dayX} from '../../model/ganttScale';
import {MS_PER_DAY} from '../../model/workTime';

/** Height of a chart row, and of the detailed plan's bar in it, per card size. */
export const ROW_HEIGHT: Record<CardSize, number> = {normal: 32, small: 24};
export const BAR_HEIGHT: Record<CardSize, number> = {normal: 14, small: 10};
/** Room left above and below the tallest (high-level) band. */
const BAND_MARGIN = 4;
/** Narrowest bar drawn, so one-day plans stay visible when zoomed out. */
const MIN_BAR_WIDTH = 3;

export type Box = {left: number; width: number};

/** Where a span of days (both ends included) lies on the scale. */
export const spanBox = (scale: GanttScale, span: Span): Box => {
  const left = dayX(scale, span.start);
  return {left, width: Math.max(MIN_BAR_WIDTH, dayX(scale, span.end + MS_PER_DAY) - left)};
};

/** The x of the end of a day: a deadline falls at the end of its day. */
export const dayEndX = (scale: GanttScale, day: number): number => dayX(scale, day + MS_PER_DAY);

/**
 * Height of planning level `index` of `count`: the high-level band nearly fills the row, each
 * finer level is thinner, and the detailed plan is the bar.
 */
export const levelHeight = (index: number, count: number, size: CardSize): number => {
  const bar = BAR_HEIGHT[size];
  if (count <= 1) {
    return bar;
  }
  const tallest = ROW_HEIGHT[size] - 2 * BAND_MARGIN;
  return Math.round(tallest - ((tallest - bar) * index) / (count - 1));
};

/** The span that stands for a row in arrows: its detailed plan, else the derived, borrowed or due day. */
export const anchorSpan = (row: GanttIssueRow): Span | undefined => {
  const due = row.schedule.due;
  return detailedSpan(row.schedule) ?? row.derived ?? row.borrowed ?? (due === undefined ? undefined : {start: due, end: due});
};

/** Left and right ends of a row's anchor on the scale; the due diamond counts when it is the only time. */
export const anchorBox = (scale: GanttScale, row: GanttIssueRow): Box | undefined => {
  const span = anchorSpan(row);
  return span ? spanBox(scale, span) : undefined;
};

export type Point = {x: number; y: number};

/** A relation drawn as a curve, with the point its label sits on. */
export type RelationCurve = {path: string; mid: Point};

/** Shortest straight-ish run into and out of the bars, so the arrowhead sits on a straight line. */
const MIN_HANDLE = 24;
/** Room between a bar and the end of a line, so the arrowhead tip touches the bar without covering it. */
const LINE_GAP = 2;
const BEZIER_WEIGHT = 3;
const BEZIER_SUM = 8;

/**
 * A curve that leaves the end of `from` to the right and enters the start of `to` from the left,
 * horizontal at both ends: the finish-to-start arrow of a Gantt chart, "B is required for A" from
 * the end of B into the start of A. When A starts before B ends the curve loops back, and the
 * handles grow with the distance between the rows.
 */
export const relationCurve = (from: Point, to: Point): RelationCurve => {
  const sx = from.x + LINE_GAP;
  const ex = to.x - LINE_GAP;
  const ahead = ex - sx;
  const handle = Math.max(MIN_HANDLE, Math.abs(ahead) / 2, ahead < 0 ? Math.abs(to.y - from.y) / 2 : 0);
  const c1 = {x: sx + handle, y: from.y};
  const c2 = {x: ex - handle, y: to.y};
  return {
    path: `M ${sx} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${ex} ${to.y}`,
    // The middle of the cubic Bézier (t = 0.5).
    mid: {
      x: (sx + BEZIER_WEIGHT * c1.x + BEZIER_WEIGHT * c2.x + ex) / BEZIER_SUM,
      y: (from.y + BEZIER_WEIGHT * c1.y + BEZIER_WEIGHT * c2.y + to.y) / BEZIER_SUM
    }
  };
};

/** Half the height of the due diamond, a square turned 45°. */
const DUE_HALF: Record<CardSize, number> = {normal: 7, small: 6};

/**
 * The y, within its row, of the bottom of the tallest mark a row draws: its coarsest plan's
 * frame, its bar, the span derived from or borrowed for it, or its due diamond. Tree lines to
 * subtasks start there, so they never cross the parent's own marks.
 */
export const markBottom = (row: GanttIssueRow, size: CardSize): number => {
  const {spans} = row.schedule;
  const heights = [
    ...spans.flatMap((span, index) => (span ? [levelHeight(index, spans.length, size)] : [])),
    ...(row.derived || row.borrowed ? [BAR_HEIGHT[size]] : []),
    ...(row.schedule.due === undefined ? [] : [2 * DUE_HALF[size]])
  ];
  return ROW_HEIGHT[size] / 2 + (heights.length > 0 ? Math.max(...heights) : BAR_HEIGHT[size]) / 2;
};
