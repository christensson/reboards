import {describe, expect, it} from 'vitest';
import {levelHeight, relationCurve} from './geometry';

const numbers = (path: string): number[] => path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];

describe('relationCurve', () => {
  it('leaves the needed issue to the right and enters the dependent one from the left, flat at both ends', () => {
    const {path, mid} = relationCurve({x: 100, y: 16}, {x: 300, y: 80});
    const [sx, sy, c1x, c1y, c2x, c2y, ex, ey] = numbers(path);
    expect([sx, sy, ex, ey]).toEqual([102, 16, 298, 80]);
    expect(c1y).toBe(sy);
    expect(c2y).toBe(ey);
    expect(c1x).toBeGreaterThan(sx);
    expect(c2x).toBeLessThan(ex);
    expect(mid).toEqual({x: 200, y: 48});
  });

  it('loops back when the dependent issue starts before the needed one ends', () => {
    const [sx, , c1x, , c2x, , ex] = numbers(relationCurve({x: 300, y: 16}, {x: 100, y: 240}).path);
    expect(c1x).toBeGreaterThan(sx);
    expect(c2x).toBeLessThan(ex);
    expect(c1x - sx).toBeGreaterThanOrEqual(112);
  });
});

describe('levelHeight', () => {
  it('makes the high-level band tallest and the detailed plan the bar', () => {
    expect(levelHeight(0, 2, 'normal')).toBe(24);
    expect(levelHeight(1, 2, 'normal')).toBe(14);
    expect(levelHeight(0, 1, 'normal')).toBe(14);
  });
});
