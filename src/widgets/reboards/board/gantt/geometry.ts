import type {CardSize} from '@/common/storage/prefs';
import {type GanttIssueRow, type GanttRow, type Span, detailedSpan} from '../../model/gantt';
import {type GanttScale, dayX} from '../../model/ganttScale';
import {MS_PER_DAY} from '../../model/workTime';

/** Height of a chart row, and of the detailed plan's bar in it, per card size. */
export const ROW_HEIGHT: Record<CardSize, number> = {normal: 32, small: 24};
export const BAR_HEIGHT: Record<CardSize, number> = {normal: 14, small: 10};
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
 * Heights of the planning levels, by how many there are (high-level first): the outer frame nearly
 * fills the row, a middle level is a smaller dashed frame, the detailed plan is the bar, a little
 * lower with three levels. Each height leaves an even gap to the row, so every mark sits on whole
 * pixels, centred.
 */
const MARKS: Record<CardSize, {frame: number; middle: number; bar: number; barOfThree: number}> = {
  normal: {frame: 24, middle: 18, bar: 14, barOfThree: 12},
  small: {frame: 16, middle: 12, bar: 10, barOfThree: 8}
};
const LEVEL_HEIGHTS: Record<CardSize, number[][]> = {
  normal: [[MARKS.normal.bar], [MARKS.normal.frame, MARKS.normal.bar], [MARKS.normal.frame, MARKS.normal.middle, MARKS.normal.barOfThree]],
  small: [[MARKS.small.bar], [MARKS.small.frame, MARKS.small.bar], [MARKS.small.frame, MARKS.small.middle, MARKS.small.barOfThree]]
};

/** Height of planning level `index` of `count` (at most three). */
export const levelHeight = (index: number, count: number, size: CardSize): number => {
  const heights = LEVEL_HEIGHTS[size][Math.min(Math.max(count, 1), LEVEL_HEIGHTS[size].length) - 1];
  return heights[Math.min(index, heights.length - 1)];
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
 * The y, within its row, of the bottom of the tallest mark a row draws at `x`: its coarsest plan's
 * frame, its bar, the span derived from or borrowed for it, or its due diamond, whichever cover
 * that x. Tree lines to subtasks start there, so they never cross the parent's own marks nor
 * leave a gap below them. Without any mark at x, the bottom of the bar.
 */
export const markBottom = (row: GanttIssueRow, size: CardSize, scale: GanttScale, x: number): number => {
  const covers = (span: Span) => {
    const box = spanBox(scale, span);
    return box.left <= x && x <= box.left + box.width;
  };
  const {spans, due} = row.schedule;
  const heights = [
    ...spans.flatMap((span, index) => (span && covers(span) ? [levelHeight(index, spans.length, size)] : [])),
    ...[row.derived, row.borrowed].flatMap(span => (span && covers(span) ? [BAR_HEIGHT[size]] : [])),
    ...(due !== undefined && Math.abs(dayEndX(scale, due) - x) <= DUE_HALF[size] ? [2 * DUE_HALF[size]] : [])
  ];
  return ROW_HEIGHT[size] / 2 + (heights.length > 0 ? Math.max(...heights) : BAR_HEIGHT[size]) / 2;
};

/**
 * Where each row of the chart starts and how high it is: the group of top-level issues without
 * time is half a row. It comes after every row with time, so lines between bars keep row index ×
 * row height.
 */
export const rowLayout = (rows: GanttRow[], rowHeight: number): {tops: number[]; heights: number[]; total: number} => {
  const heights = rows.map(row => (row.type === 'undated' ? rowHeight / 2 : rowHeight));
  const tops: number[] = [];
  let total = 0;
  heights.forEach(height => {
    tops.push(total);
    total += height;
  });
  return {tops, heights, total};
};
