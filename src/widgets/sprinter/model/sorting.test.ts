import {describe, expect, it} from 'vitest';
import {orderValues} from './sorting';

const v = (key: string, ordinal?: number) => ({key, label: key, ordinal});

describe('orderValues', () => {
  it('sorts alphabetically with natural numbers', () => {
    expect(orderValues([v('b'), v('a10'), v('a2')], 'alphabetical', []).map(x => x.key)).toEqual(['a2', 'a10', 'b']);
  });

  it('sorts descending variants', () => {
    expect(orderValues([v('b'), v('a10'), v('a2')], 'alphabetical-desc', []).map(x => x.key)).toEqual(['b', 'a10', 'a2']);
    expect(orderValues([v('10'), v('x'), v('2')], 'numerical-desc', []).map(x => x.key)).toEqual(['x', '10', '2']);
  });

  it('sorts numerically with non-numbers last', () => {
    expect(orderValues([v('10'), v('x'), v('2'), v('1.5')], 'numerical', []).map(x => x.key)).toEqual(['1.5', '2', '10', 'x']);
  });

  it('applies custom order and appends unknown values by ordinal then label', () => {
    const values = [v('Minor', 4), v('Major', 2), v('Critical', 1), v('zzz'), v('New', 9)];
    expect(orderValues(values, 'custom', ['Minor', 'Critical']).map(x => x.key)).toEqual(['Minor', 'Critical', 'Major', 'New', 'zzz']);
  });
});
