import {describe, expect, it} from 'vitest';
import type {BoardLayout, LayoutGroup} from './layout';
import {collapseGroupLevel, expandGroupLevel} from './visibility';

const group = (key: string, depth: number, children: LayoutGroup[] = []): LayoutGroup => ({key, depth, children} as unknown as LayoutGroup);

// Swimlane A: epic 1 > story 2 > task box 3; swimlane B: epic 4 > story 5.
const layout = {
  rows: [
    {key: 'A', outerKey: null, groups: [group('1', 0, [group('2', 1, [group('3', 2)])])]},
    {key: 'B', outerKey: 'outer', groups: [group('4', 0, [group('5', 1)])]}
  ]
} as unknown as BoardLayout;

const state = (groups: string[], rows: string[] = [], outerRows: string[] = []) => ({groups: new Set(groups), rows: new Set(rows), outerRows: new Set(outerRows)});

describe('collapse and expand one box level', () => {
  it('collapses the deepest open boxes each time', () => {
    expect(collapseGroupLevel(layout, state([]))).toEqual(['3']);
    expect(collapseGroupLevel(layout, state(['3']))).toEqual(['2', '5']);
    expect(collapseGroupLevel(layout, state(['1', '4']))).toEqual([]);
  });

  it('expands the shallowest collapsed boxes each time', () => {
    expect(expandGroupLevel(layout, state(['1', '4']))).toEqual(['1', '4']);
    expect(expandGroupLevel(layout, state(['2', '3', '5']))).toEqual(['2', '5']);
  });

  it('ignores boxes in collapsed swimlanes and inside collapsed boxes', () => {
    expect(collapseGroupLevel(layout, state([], ['A']))).toEqual(['5']);
    expect(collapseGroupLevel(layout, state([], [], ['outer']))).toEqual(['3']);
    expect(expandGroupLevel(layout, state(['1', '2']))).toEqual(['1']);
  });
});
