import {describe, expect, it} from 'vitest';
import type {UniverseValue} from './fieldUniverse';
import {sprintForDate} from './sprints';

const sprint = (key: string, startDate?: number, releaseDate?: number): UniverseValue => ({
  key,
  label: key,
  ordinal: 0,
  ...(startDate === undefined ? {} : {startDate}),
  ...(releaseDate === undefined ? {} : {releaseDate})
});

describe('sprintForDate', () => {
  const values = [sprint('S1', 100, 200), sprint('S2', 201, 300), sprint('S3', 250, 400)];

  it('picks the sprint containing the date', () => {
    expect(sprintForDate(values, 150)).toBe('S1');
    expect(sprintForDate(values, 200)).toBe('S1');
  });

  it('prefers the latest start when ranges overlap', () => {
    expect(sprintForDate(values, 260)).toBe('S3');
  });

  it('returns null outside all ranges or without dates', () => {
    expect(sprintForDate(values, 50)).toBeNull();
    expect(sprintForDate([sprint('A'), sprint('B', 10)], 20)).toBeNull();
  });
});
