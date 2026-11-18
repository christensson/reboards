import {describe, expect, it} from 'vitest';
import type {GanttIssueRow} from '../../model/gantt';
import type {BoardIssue} from '../../model/issue';
import {levelHeight, markBottom, relationCurve, revealScroll, rowLayout} from './geometry';

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
  it('makes the high-level frame tallest, a middle frame smaller, and the detailed plan the bar', () => {
    expect([0, 1].map(index => levelHeight(index, 2, 'normal'))).toEqual([24, 14]);
    expect([0, 1, 2].map(index => levelHeight(index, 3, 'normal'))).toEqual([24, 18, 12]);
    expect([0, 1, 2].map(index => levelHeight(index, 3, 'small'))).toEqual([16, 12, 8]);
    expect(levelHeight(0, 1, 'normal')).toBe(14);
  });

  it('centres every mark on whole pixels', () => {
    [1, 2, 3].forEach(count => ['normal', 'small'].forEach(size => {
      const row = size === 'normal' ? 32 : 24;
      Array.from({length: count}, (_, index) => levelHeight(index, count, size as 'normal' | 'small'))
        .forEach(height => expect((row - height) % 2).toBe(0));
    }));
  });
});

describe('markBottom', () => {
  const day = 86_400_000;
  // 10 px per day from day 0.
  const scale = {start: 0, end: 30 * day, pxPerDay: 10, width: 300, top: [], bottom: [], showWeekends: false};
  const wide = {start: 0, end: 19 * day};
  const late = {start: 10 * day, end: 14 * day};
  const row = (extra: Partial<GanttIssueRow>): GanttIssueRow => ({
    type: 'issue', key: '1', issue: {id: '1'} as BoardIssue, depth: 0, parentId: null, schedule: {spans: [null, null]}, timed: true, childCount: 1,
    undatedChildIds: [], showingUndated: false, collapsed: false, workload: {pastEnd: false}, overdue: false, overrun: false, early: false, late: false, ...extra
  });

  it('is the bottom of the tallest mark covering x', () => {
    // Row 32 px high, centre 16: the coarse frame is 24 px, the bar 14 px, the diamond 14 px.
    expect(markBottom(row({schedule: {spans: [wide, null]}}), 'normal', scale, 6)).toBe(28);
    expect(markBottom(row({schedule: {spans: [wide, wide]}}), 'normal', scale, 6)).toBe(28);
    expect(markBottom(row({schedule: {spans: [null, wide]}}), 'normal', scale, 6)).toBe(23);
    expect(markBottom(row({derived: wide}), 'normal', scale, 6)).toBe(23);
    expect(markBottom(row({schedule: {spans: [null, null], due: 0}}), 'normal', scale, 10)).toBe(23);
  });

  it('leaves out a coarse frame that starts later than x', () => {
    expect(markBottom(row({schedule: {spans: [late, wide]}}), 'normal', scale, 6)).toBe(23);
    expect(markBottom(row({schedule: {spans: [late, wide]}}), 'normal', scale, 120)).toBe(28);
  });
});

describe('rowLayout', () => {
  it('stacks rows, the group of issues without time at half height', () => {
    const rows = [
      {type: 'issue', depth: 0},
      {type: 'undated', key: '__undated__', parentId: null, depth: 0, count: 2, expanded: true},
      {type: 'issue', depth: 0}
    ] as unknown as Parameters<typeof rowLayout>[0];
    expect(rowLayout(rows, 32)).toEqual({tops: [0, 32, 48], heights: [32, 16, 32], total: 80});
  });
});

describe('revealScroll', () => {
  // A 600 px wide view scrolled to 1000, with 32 px margins.
  it('leaves a stretch that shows where it is', () => {
    expect(revealScroll({left: 1100, width: 200}, 1000, 600, 32)).toBeNull();
  });

  it('moves in just far enough from either side', () => {
    expect(revealScroll({left: 900, width: 200}, 1000, 600, 32)).toBe(868);
    expect(revealScroll({left: 1500, width: 200}, 1000, 600, 32)).toBe(1132);
  });

  it('starts a stretch wider than the view at the left margin, never before the chart', () => {
    expect(revealScroll({left: 1400, width: 900}, 1000, 600, 32)).toBe(1368);
    expect(revealScroll({left: 10, width: 100}, 1000, 600, 32)).toBe(0);
  });
});
