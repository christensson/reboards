import type {TimeBucket} from '@/common/model/board-config';
import type {Sprint} from './ganttEdit';
import {HOURS_PER_DAY, MS_PER_DAY, formatWorkHours, workDaysBetween} from './workTime';

/** The days of a time row, both included, as UTC days. */
export type Period = {start: number; end: number};

const DAYS_PER_WEEK = 7;
const MONTHS_PER_QUARTER = 3;
const THURSDAY = 4;
const PERSONS_DECIMALS = 1;

const monday = (day: number): number => day - ((new Date(day).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK) * MS_PER_DAY;

const monthsFrom = (day: number, months: number): number => {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
};

const startOfMonths = (day: number, size: number): number => {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / size) * size, 1);
};

/**
 * The time row a day falls in: the day itself, its week (Monday to Sunday), month or quarter, or
 * for rows per sprint the sprint that places the issue (else the day).
 */
export const bucketPeriod = (day: number, bucket: TimeBucket, sprint?: Sprint): Period => {
  switch (bucket) {
    case 'week': {
      const start = monday(day);
      return {start, end: start + (DAYS_PER_WEEK - 1) * MS_PER_DAY};
    }
    case 'month':
    case 'quarter': {
      const size = bucket === 'month' ? 1 : MONTHS_PER_QUARTER;
      const start = startOfMonths(day, size);
      return {start, end: monthsFrom(start, size) - MS_PER_DAY};
    }
    case 'sprint':
      return sprint ? {start: sprint.start, end: sprint.end} : {start: day, end: day};
    default:
      return {start: day, end: day};
  }
};

/** The ISO week number of a day (weeks start on Monday; week 1 holds the year's first Thursday). */
export const isoWeek = (day: number): number => {
  const thursday = monday(day) + (THURSDAY - 1) * MS_PER_DAY;
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / (DAYS_PER_WEEK * MS_PER_DAY)) + 1;
};

const monthYear = new Intl.DateTimeFormat(undefined, {month: 'long', year: 'numeric', timeZone: 'UTC'});

/** What a time row shows: its period, and what it holds. */
export type TimeRowInfo = {
  bucket: TimeBucket;
  period: Period;
  /** Versions placing the row, for rows per sprint. */
  names: string[];
  count: number;
  /** Estimated work of the row's issues, in working hours. */
  hours: number;
};

/** "Week 47 · 16 Nov – 22 Nov", "November 2026", "Q4 2026", "Sprint 4 · 17 Nov – 28 Nov", or the day. */
export const periodLabel = ({bucket, period, names}: Pick<TimeRowInfo, 'bucket' | 'period' | 'names'>, format: (day: number) => string): string => {
  const range = `${format(period.start)} – ${format(period.end)}`;
  switch (bucket) {
    case 'week':
      return `Week ${isoWeek(period.start)} · ${range}`;
    case 'month':
      return monthYear.format(period.start);
    case 'quarter':
      return `Q${Math.floor(new Date(period.start).getUTCMonth() / MONTHS_PER_QUARTER) + 1} ${new Date(period.start).getUTCFullYear()}`;
    case 'sprint':
      return names.length > 0 && period.end > period.start ? `${names.join(', ')} · ${range}` : names.join(', ') || format(period.start);
    default:
      return format(period.start);
  }
};

/** "12 issues · 3w 3d of work · 2.3 persons": persons only for rows longer than a day with work. */
export const rowStats = ({period, count, hours}: Pick<TimeRowInfo, 'period' | 'count' | 'hours'>): string => {
  const parts = [`${count} ${count === 1 ? 'issue' : 'issues'}`];
  if (hours > 0) {
    parts.push(`${formatWorkHours(hours)} of work`);
    const workDays = workDaysBetween(period.start, period.end);
    if (period.end > period.start && workDays > 0) {
      parts.push(`${(hours / (workDays * HOURS_PER_DAY)).toFixed(PERSONS_DECIMALS)} persons`);
    }
  }
  return parts.join(' · ');
};
