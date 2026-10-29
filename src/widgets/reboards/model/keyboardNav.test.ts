import {describe, expect, it} from 'vitest';
import type {BoardLayout} from './layout';
import {nearestInDirection, stepTarget} from './keyboardNav';

const box = (left: number, top: number) => ({left, top, width: 100, height: 40});

describe('nearestInDirection', () => {
  const cards = [
    {id: 'right', box: box(200, 0)},
    {id: 'far-right', box: box(400, 0)},
    {id: 'below', box: box(0, 60)},
    {id: 'below-right', box: box(150, 70)}
  ];

  it('finds the closest card that way, preferring cards in line', () => {
    expect(nearestInDirection(box(0, 0), cards, 'right')).toBe('right');
    expect(nearestInDirection(box(0, 0), cards, 'down')).toBe('below');
    expect(nearestInDirection(box(0, 0), cards, 'left')).toBeNull();
    expect(nearestInDirection(box(200, 0), cards, 'left')).toBe('below-right');
  });
});

describe('stepTarget', () => {
  const layout = {
    columns: [
      {id: 'a', index: 0}, {id: 'b', index: 1}, {id: 'c', index: 2}, {id: '__assign__', index: 3, assign: true}
    ],
    rows: [
      {key: 'r1', kind: 'normal', outerKey: null}, {key: 'r2', kind: 'normal', outerKey: null}, {key: 'pick', kind: 'picker', outerKey: null}
    ]
  } as unknown as BoardLayout;
  const none = {rows: new Set<string>(), columns: new Set<string>(), outerRows: new Set<string>()};

  it('moves one column or row at a time, skipping collapsed columns, "Assign…" columns and picker rows', () => {
    expect(stepTarget(layout, {rowKey: 'r1', columnId: 'a'}, 'right', none)).toEqual({rowKey: 'r1', columnId: 'b'});
    expect(stepTarget(layout, {rowKey: 'r1', columnId: 'a'}, 'right', {...none, columns: new Set(['b'])})).toEqual({rowKey: 'r1', columnId: 'c'});
    expect(stepTarget(layout, {rowKey: 'r1', columnId: 'c'}, 'right', none)).toEqual({rowKey: 'r1', columnId: 'c'});
    expect(stepTarget(layout, {rowKey: 'r1', columnId: 'a'}, 'down', none)).toEqual({rowKey: 'r2', columnId: 'a'});
    expect(stepTarget(layout, {rowKey: 'r2', columnId: 'a'}, 'down', none)).toEqual({rowKey: 'r2', columnId: 'a'});
  });
});
