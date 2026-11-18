import {describe, expect, it} from 'vitest';
import {bucketPeriod, isoWeek, periodLabel, rowStats} from './timeBuckets';

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const format = (time: number) => new Date(time).toISOString().slice(5, 10);

describe('bucketPeriod', () => {
  it('finds the day, week, month or quarter a day falls in', () => {
    expect(bucketPeriod(day('2026-11-18'), 'day')).toEqual({start: day('2026-11-18'), end: day('2026-11-18')});
    expect(bucketPeriod(day('2026-11-18'), 'week')).toEqual({start: day('2026-11-16'), end: day('2026-11-22')});
    expect(bucketPeriod(day('2026-11-22'), 'week')).toEqual({start: day('2026-11-16'), end: day('2026-11-22')});
    expect(bucketPeriod(day('2026-11-18'), 'month')).toEqual({start: day('2026-11-01'), end: day('2026-11-30')});
    expect(bucketPeriod(day('2026-11-18'), 'quarter')).toEqual({start: day('2026-10-01'), end: day('2026-12-31')});
  });

  it('takes the placing sprint for rows per sprint, else the day', () => {
    const sprint = {key: 'S4', start: day('2026-11-16'), end: day('2026-11-27')};
    expect(bucketPeriod(day('2026-11-27'), 'sprint', sprint)).toEqual({start: sprint.start, end: sprint.end});
    expect(bucketPeriod(day('2026-11-27'), 'sprint')).toEqual({start: day('2026-11-27'), end: day('2026-11-27')});
  });
});

describe('row headers', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeek(day('2026-11-18'))).toBe(47);
    expect(isoWeek(day('2027-01-01'))).toBe(53);
    expect(isoWeek(day('2026-01-01'))).toBe(1);
  });

  it('names the period', () => {
    const period = bucketPeriod(day('2026-11-18'), 'week');
    expect(periodLabel({bucket: 'week', period, names: []}, format)).toBe('Week 47 · 11-16 – 11-22');
    expect(periodLabel({bucket: 'quarter', period: bucketPeriod(day('2026-11-18'), 'quarter'), names: []}, format)).toBe('Q4 2026');
    expect(periodLabel({bucket: 'sprint', period: {start: day('2026-11-16'), end: day('2026-11-27')}, names: ['S4']}, format)).toBe('S4 · 11-16 – 11-27');
    expect(periodLabel({bucket: 'day', period: {start: day('2026-11-18'), end: day('2026-11-18')}, names: []}, format)).toBe('11-18');
  });

  it('sums the work and the persons it needs', () => {
    const week = bucketPeriod(day('2026-11-18'), 'week');
    expect(rowStats({period: week, count: 3, hours: 80})).toBe('3 issues · 2w of work · 2.0 persons');
    expect(rowStats({period: {start: day('2026-11-18'), end: day('2026-11-18')}, count: 1, hours: 4})).toBe('1 issue · 4h of work');
    expect(rowStats({period: week, count: 2, hours: 0})).toBe('2 issues');
  });
});
