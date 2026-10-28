import {describe, expect, it} from 'vitest';
import type {UniverseValue} from './fieldUniverse';
import {currentSprints, sortSprintsByDate, sprintDateRange, sprintForDate} from './sprints';

const sprint = (key: string, startDate?: number, releaseDate?: number): UniverseValue => ({
  key,
  label: key,
  ordinal: 0,
  ...(startDate === undefined ? {} : {startDate}),
  ...(releaseDate === undefined ? {} : {releaseDate})
});

// Sprint dates are stored at noon UTC on their calendar day.
const day = (date: number): number => Date.UTC(2026, 9, date, 12);

describe('sprintForDate', () => {
  const values = [sprint('S1', day(1), day(7)), sprint('S2', day(8), day(14)), sprint('S3', day(12), day(20))];

  it('picks the sprint running on that day, first and last day included', () => {
    expect(sprintForDate(values, day(3))).toBe('S1');
    expect(sprintForDate(values, Date.UTC(2026, 9, 7, 20))).toBe('S1');
    expect(sprintForDate(values, Date.UTC(2026, 9, 1, 1))).toBe('S1');
  });

  it('prefers the latest start when ranges overlap', () => {
    expect(sprintForDate(values, day(13))).toBe('S3');
  });

  it('returns null outside all ranges or without dates', () => {
    expect(sprintForDate(values, day(25))).toBeNull();
    expect(sprintForDate([sprint('A'), sprint('B', day(1))], day(2))).toBeNull();
  });
});

describe('currentSprints', () => {
  it('lists every sprint running today, newest first', () => {
    const values = [sprint('S1', day(1), day(7)), sprint('S2', day(5), day(14)), sprint('S3', day(8), day(20))];
    expect(currentSprints(values, day(6)).map(v => v.key)).toEqual(['S2', 'S1']);
  });
});

describe('sortSprintsByDate', () => {
  it('puts the newest sprint first and undated ones last in their order', () => {
    const values = [sprint('Old', 100, 200), sprint('X'), sprint('New', 300, 400), sprint('EndOnly', undefined, 250), sprint('Y')];
    expect(sortSprintsByDate(values).map(v => v.key)).toEqual(['New', 'EndOnly', 'Old', 'X', 'Y']);
  });
});

describe('sprintDateRange', () => {
  const iso = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

  it('formats both dates, with an open end when one is missing', () => {
    expect(sprintDateRange(sprint('S', day(1), day(14)), iso)).toBe('2026-10-01 – 2026-10-14');
    expect(sprintDateRange(sprint('S', day(1)), iso)).toBe('2026-10-01 – …');
    expect(sprintDateRange(sprint('S'), iso)).toBeUndefined();
  });
});
