import type {GanttZoom} from '@/common/storage/prefs';
import {MS_PER_DAY} from './workTime';

/** Width of one day at each preset zoom level, in pixels. */
export const PX_PER_DAY: Record<GanttZoom, number> = {day: 32, week: 14, month: 4, quarter: 1.5};

/** The zoom range: from about two months to about seven years in a 1,000 pixel wide chart. */
export const MIN_PX_PER_DAY = 0.4;
export const MAX_PX_PER_DAY = 64;

/** The narrowest day each scale tier still labels legibly, finest first. */
const DAY_TIER_MIN_PX = 20;
const WEEK_TIER_MIN_PX = 7;
const MONTH_TIER_MIN_PX = 2;
const TIER_MIN_PX: [GanttZoom, number][] = [['day', DAY_TIER_MIN_PX], ['week', WEEK_TIER_MIN_PX], ['month', MONTH_TIER_MIN_PX]];

/** The ticks a day width shows: days when there is room for them, else weeks, months or quarters. */
export const tierFor = (pxPerDay: number): GanttZoom => TIER_MIN_PX.find(([, min]) => pxPerDay >= min)?.[0] ?? 'quarter';

export const clampPxPerDay = (pxPerDay: number): number => Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, pxPerDay));

/** Days of room before and after the drawn spans, per scale tier. */
export const PAD_DAYS: Record<GanttZoom, number> = {day: 3, week: 7, month: 14, quarter: 31};

/** Room on each side of the drawn spans, in days, at a day width. */
export const padDays = (pxPerDay: number): number => PAD_DAYS[tierFor(pxPerDay)];

/**
 * The day width that fits `days` days, padded at both ends, into `width` pixels. The padding
 * depends on the zoom, so the width is worked out once more with the padding the first guess has.
 */
export const fitPxPerDay = (days: number, width: number): number => {
  const first = clampPxPerDay(width / Math.max(1, days));
  return clampPxPerDay(width / Math.max(1, days + 2 * padDays(first)));
};

/** A labelled stretch of the scale: [start, end) in UTC days. */
export type Tick = {start: number; end: number; label: string};

export type GanttScale = {
  start: number;
  end: number;
  pxPerDay: number;
  /** Total width in pixels. */
  width: number;
  /** The coarse tier on top (months or years) and the fine tier below (days, weeks, months, quarters). */
  top: Tick[];
  bottom: Tick[];
  /** Whether weekends are wide enough to shade. */
  showWeekends: boolean;
};

const MONTHS_PER_QUARTER = 3;
const DAYS_PER_WEEK = 7;
const MONDAY = 1;
/** Zoom levels whose days are wide enough to shade weekends. */
const WEEKEND_ZOOMS: GanttZoom[] = ['day', 'week'];

const monthName = new Intl.DateTimeFormat(undefined, {month: 'short', timeZone: 'UTC'});
const monthYear = new Intl.DateTimeFormat(undefined, {month: 'short', year: 'numeric', timeZone: 'UTC'});

const startOfMonth = (day: number): number => {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};
const addMonths = (day: number, months: number): number => {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
};
const startOfYear = (day: number): number => Date.UTC(new Date(day).getUTCFullYear(), 0, 1);
const startOfQuarter = (day: number): number => {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER, 1);
};
const startOfWeek = (day: number): number => {
  const weekday = new Date(day).getUTCDay();
  return day - ((weekday - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK) * MS_PER_DAY;
};

/** Ticks from the unit containing `start` until past `end`, clipped to [start, end). */
const ticks = (start: number, end: number, first: (day: number) => number, next: (day: number) => number, label: (day: number) => string): Tick[] => {
  const result: Tick[] = [];
  for (let at = first(start); at < end; at = next(at)) {
    result.push({start: Math.max(at, start), end: Math.min(next(at), end), label: label(at)});
  }
  return result;
};

const months = (start: number, end: number, withYear: boolean): Tick[] =>
  ticks(start, end, startOfMonth, day => addMonths(day, 1), day => (withYear ? monthYear : monthName).format(day));
const years = (start: number, end: number): Tick[] =>
  ticks(start, end, startOfYear, day => Date.UTC(new Date(day).getUTCFullYear() + 1, 0, 1), day => String(new Date(day).getUTCFullYear()));

const fineTicks = (zoom: GanttZoom, start: number, end: number): Tick[] => {
  switch (zoom) {
    case 'day':
      return ticks(start, end, day => day, day => day + MS_PER_DAY, day => String(new Date(day).getUTCDate()));
    case 'week':
      return ticks(start, end, startOfWeek, day => day + DAYS_PER_WEEK * MS_PER_DAY, day => String(new Date(day).getUTCDate()));
    case 'month':
      return months(start, end, false);
    default:
      return ticks(start, end, startOfQuarter, day => addMonths(day, MONTHS_PER_QUARTER), day => `Q${Math.floor(new Date(day).getUTCMonth() / MONTHS_PER_QUARTER) + 1}`);
  }
};

/** The scale of a chart over [start, end] (UTC days, end included) at a day width in pixels. */
export const ganttScale = (range: {start: number; end: number}, pxPerDay: number): GanttScale => {
  const start = range.start;
  const end = range.end + MS_PER_DAY;
  const zoom = tierFor(pxPerDay);
  const coarseByMonth = zoom === 'day' || zoom === 'week';
  return {
    start,
    end,
    pxPerDay,
    width: Math.round(((end - start) / MS_PER_DAY) * pxPerDay),
    top: coarseByMonth ? months(start, end, true) : years(start, end),
    bottom: fineTicks(zoom, start, end),
    showWeekends: WEEKEND_ZOOMS.includes(zoom)
  };
};

/** The day (fractional) at an x on the scale. */
export const xDay = (scale: GanttScale, x: number): number => scale.start + (x / scale.pxPerDay) * MS_PER_DAY;

/** Left edge of a day on the scale, in pixels. */
export const dayX = (scale: GanttScale, day: number): number => ((day - scale.start) / MS_PER_DAY) * scale.pxPerDay;
