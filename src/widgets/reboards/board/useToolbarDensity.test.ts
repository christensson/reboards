import {describe, expect, it} from 'vitest';
import {pickDensity} from './useToolbarDensity';

describe('pickDensity', () => {
  it('folds one level at a time while the toolbar overflows, up to the tightest', () => {
    expect(pickDensity(0, [], 900, true)).toBe(1);
    expect(pickDensity(3, [], 300, true)).toBe(3);
  });

  it('unfolds once the width fits what the roomier level needed', () => {
    expect(pickDensity(2, [1200, 1000], 1000, false)).toBe(1);
    expect(pickDensity(2, [1200, 1000], 999, false)).toBe(2);
    expect(pickDensity(1, [], 2000, false)).toBe(1);
    expect(pickDensity(0, [], 2000, false)).toBe(0);
  });
});
