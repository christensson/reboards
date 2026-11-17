import type {GanttConfig} from '@/common/model/board-config';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';

/**
 * Working time as YouTrack periods count it: a working day is 8 hours and a working week 5 days.
 * Days are calendar days at UTC midnight, the way calendar dates are compared on the board.
 */
export const MS_PER_DAY = 86_400_000;
export const HOURS_PER_DAY = 8;
export const DAYS_PER_WEEK = 5;
const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_WORKDAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const CALENDAR_WEEK = 7;
const SUNDAY = 0;
const SATURDAY = 6;
/** Rounding slack, so 2.0000001 working days do not count as 3. */
const EPSILON = 1e-6;

/** The UTC day a time falls on. */
export const utcDay = (time: number): number => Math.floor(time / MS_PER_DAY) * MS_PER_DAY;

/** The local calendar date of a time, as the UTC day calendar dates are stored on. */
export const localDay = (time: number): number => {
  const date = new Date(time);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

export const isWorkday = (day: number): boolean => {
  const weekday = new Date(day).getUTCDay();
  return weekday !== SUNDAY && weekday !== SATURDAY;
};

/** Working days in a period of the given minutes. */
export const periodWorkDays = (minutes: number): number => minutes / MINUTES_PER_WORKDAY;

/**
 * The last day of `days` working days that start on `day` (direction 1) or end on it (-1). Both
 * days count, so one day ends where it starts and a week from a Monday ends on the Friday. A
 * weekend day first moves to the nearest working day in the direction.
 */
export const addWorkDays = (day: number, days: number, direction: 1 | -1): number => {
  let current = day;
  while (!isWorkday(current)) {
    current += direction * MS_PER_DAY;
  }
  let left = Math.max(1, Math.ceil(days - EPSILON)) - 1;
  while (left > 0) {
    current += direction * MS_PER_DAY;
    if (isWorkday(current)) {
      left--;
    }
  }
  return current;
};

/** Working days from `start` to `end`, both included; 0 when the end is before the start. */
export const workDaysBetween = (start: number, end: number): number => {
  if (end < start) {
    return 0;
  }
  const total = Math.round((end - start) / MS_PER_DAY) + 1;
  const weeks = Math.floor(total / CALENDAR_WEEK);
  let count = weeks * DAYS_PER_WEEK;
  for (let index = weeks * CALENDAR_WEEK; index < total; index++) {
    if (isWorkday(start + index * MS_PER_DAY)) {
      count++;
    }
  }
  return count;
};

/** The issue's estimate in working hours: a period, or a number in the configured unit. */
export const estimateHours = (issue: BoardIssue, gantt: GanttConfig, universe: FieldUniverse): number | undefined => {
  const field = gantt.estimationField;
  if (!field) {
    return undefined;
  }
  const value = issue.fields[field.name];
  if (!value) {
    return undefined;
  }
  const kind = universe.byName.get(field.name)?.kind ?? field.kind;
  if (kind === 'period') {
    return value.minutes === undefined ? undefined : value.minutes / MINUTES_PER_HOUR;
  }
  const number = Number(value.key);
  if (!Number.isFinite(number)) {
    return undefined;
  }
  return gantt.estimationUnit === 'days' ? number * HOURS_PER_DAY : number;
};

/** Persons needed to do `hours` of work in `workDays` working days. */
export const personsNeeded = (hours: number, workDays: number): number => hours / (workDays * HOURS_PER_DAY);

/** Hours are shown to a tenth. */
const TENTHS = 10;
const roundTenth = (value: number): number => Math.round(value * TENTHS) / TENTHS;

/** "3w 2d 4h": working hours as a short period. */
export const formatWorkHours = (hours: number): string => {
  const weekHours = DAYS_PER_WEEK * HOURS_PER_DAY;
  const rounded = roundTenth(hours);
  const weeks = Math.floor(rounded / weekHours);
  const days = Math.floor((rounded - weeks * weekHours) / HOURS_PER_DAY);
  const rest = roundTenth(rounded - weeks * weekHours - days * HOURS_PER_DAY);
  const parts = [weeks ? `${weeks}w` : '', days ? `${days}d` : '', rest ? `${rest}h` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0h';
};
