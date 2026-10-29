import {describe, expect, it} from 'vitest';
import {computeEdges, routeEdges} from './connectors';
import type {BoardIssue, IssueLink} from './issue';

const link = (over: Partial<IssueLink>): IssueLink => ({
  typeId: 't', typeName: 'Depend', sourceToTarget: 'is required for', targetToSource: 'depends on', directed: true, aggregation: false, direction: 'OUTWARD', issueIds: [], ...over
});

const issue = (id: string, links: IssueLink[]): BoardIssue => ({
  id, idReadable: `SP-${id}`, summary: '', projectId: '', projectShortName: 'SP', number: Number(id), tags: [], fields: {}, links, parentIds: [], childIds: []
});

describe('computeEdges', () => {
  it('draws directed links once from the inward side and skips invisible issues', () => {
    const issues = [
      issue('1', [link({direction: 'OUTWARD', issueIds: ['2', '3']})]),
      issue('2', [link({direction: 'INWARD', issueIds: ['1']})]),
      issue('3', [link({direction: 'INWARD', issueIds: ['1']})])
    ];
    const edges = computeEdges(issues, new Set(['1', '2']), ['Depend']);
    expect(edges).toEqual([{id: 't:2:1', from: '2', to: '1', label: 'depends on', kind: 'directed', typeName: 'Depend'}]);
  });

  it('marks aggregation links and draws undirected links once', () => {
    const sub = {typeId: 's', typeName: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of', aggregation: true};
    const rel = {typeId: 'r', typeName: 'Relates', sourceToTarget: 'relates to', targetToSource: '', directed: false};
    const issues = [
      issue('1', [link({...sub, direction: 'OUTWARD', issueIds: ['2']}), link({...rel, direction: 'BOTH', issueIds: ['2']})]),
      issue('2', [link({...sub, direction: 'INWARD', issueIds: ['1']}), link({...rel, direction: 'BOTH', issueIds: ['1']})])
    ];
    const edges = computeEdges(issues, new Set(['1', '2']), ['Subtask', 'Relates']);
    expect(edges.map(e => [e.from, e.to, e.kind, e.label])).toEqual([
      ['1', '2', 'undirected', 'relates to'],
      ['2', '1', 'aggregation', 'subtask of']
    ]);
  });

  it('ignores link types that are not configured', () => {
    const issues = [issue('1', [link({direction: 'INWARD', issueIds: ['2']})]), issue('2', [])];
    expect(computeEdges(issues, new Set(['1', '2']), ['Subtask'])).toEqual([]);
  });
});

describe('routeEdges', () => {
  const card = (x: number, y: number) => ({x, y, width: 120, height: 60});
  const route = (items: {id: string; fromId: string; toId: string; from: ReturnType<typeof card>; to: ReturnType<typeof card>}[]) => routeEdges(items);
  /** The main direction a path ends in, from its last control point to its end. */
  const endDirection = (path: string): {x: number; y: number} => {
    const numbers = path.match(/-?\d+(\.\d+)?/gu)?.map(Number) ?? [];
    const [c2x, c2y, ex, ey] = numbers.slice(-4);
    const dx = ex - c2x;
    const dy = ey - c2y;
    return Math.abs(dx) >= Math.abs(dy) ? {x: Math.sign(dx), y: 0} : {x: 0, y: Math.sign(dy)};
  };
  /** The angle in degrees between the path's last segment and its main direction. */
  const endLean = (path: string): number => {
    const numbers = path.match(/-?\d+(\.\d+)?/gu)?.map(Number) ?? [];
    const [c2x, c2y, ex, ey] = numbers.slice(-4);
    const dx = Math.abs(ex - c2x);
    const dy = Math.abs(ey - c2y);
    return (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
  };

  it('connects cards in different columns with an S-curve between their facing sides', () => {
    const g = route([{id: 'e', fromId: 'a', toId: 'b', from: card(0, 0), to: card(400, 300)}]).get('e');
    expect(g?.start).toEqual({x: 120, y: 30});
    // The line stops just outside the target, so the arrowhead stays clear of its border.
    expect(g?.end).toEqual({x: 398, y: 330});
    // It points into the target's left side, leaning with the curve but no more than about 30°.
    expect(endDirection(g?.path ?? '')).toEqual({x: 1, y: 0});
    expect(endLean(g?.path ?? '')).toBeGreaterThan(5);
    expect(endLean(g?.path ?? '')).toBeLessThan(32);
  });

  it('arcs over two cards side by side, from their top borders one third in from the facing edges', () => {
    const geometries = route([
      {id: 'top', fromId: 'a', toId: 'b', from: card(0, 0), to: card(130, 0)},
      {id: 'bottom', fromId: 'b', toId: 'a', from: card(130, 0), to: card(0, 0)}
    ]);
    const top = geometries.get('top');
    expect(top?.start).toEqual({x: 80, y: 0});
    expect(top?.end).toEqual({x: 170, y: -2});
    expect(top?.mid.y).toBeLessThan(0);
    expect(endDirection(top?.path ?? '')).toEqual({x: 0, y: 1});
    // The second relation between them goes under the cards.
    const bottom = geometries.get('bottom');
    expect(bottom?.start.y).toBe(60);
    expect(bottom?.mid.y).toBeGreaterThan(60);
  });

  it('leaves the upper of two diagonal neighbours through its bottom border, toward the other card', () => {
    // b sits one card height below a and just to its right.
    const down = route([{id: 'e', fromId: 'a', toId: 'b', from: card(0, 0), to: card(130, 120)}]).get('e');
    expect(down?.start).toEqual({x: 80, y: 60});
    expect(down?.end).toEqual({x: 128, y: 150});
    expect(endDirection(down?.path ?? '')).toEqual({x: 1, y: 0});
    // The same pair the other way round: the upper card is the target, entered from below.
    const up = route([{id: 'e', fromId: 'b', toId: 'a', from: card(130, 120), to: card(0, 0)}]).get('e');
    expect(up?.start).toEqual({x: 130, y: 150});
    expect(up?.end).toEqual({x: 80, y: 62});
    expect(endDirection(up?.path ?? '')).toEqual({x: 0, y: -1});
    // Further than two card heights apart: an S-curve between the sides again.
    expect(route([{id: 'e', fromId: 'a', toId: 'b', from: card(0, 0), to: card(130, 200)}]).get('e')?.start).toEqual({x: 120, y: 30});
  });

  it('gives every relation of a card its own port, ordered by where the other cards are', () => {
    const geometries = route([
      {id: 'low', fromId: 'a', toId: 'c', from: card(0, 100), to: card(400, 300)},
      {id: 'high', fromId: 'a', toId: 'b', from: card(0, 100), to: card(400, 0)}
    ]);
    const high = geometries.get('high');
    const low = geometries.get('low');
    expect(high?.start.x).toBe(120);
    expect(low?.start.x).toBe(120);
    expect(high?.start.y).toBeLessThan(low?.start.y ?? 0);
  });

  it('loops cards stacked in one column out of distinct ports, alternating sides', () => {
    const geometries = route([
      {id: 'e1', fromId: 'a', toId: 'b', from: card(0, 0), to: card(0, 200)},
      {id: 'e2', fromId: 'a', toId: 'c', from: card(0, 0), to: card(0, 400)},
      {id: 'e3', fromId: 'a', toId: 'd', from: card(0, 0), to: card(0, 600)}
    ]);
    const starts = ['e1', 'e2', 'e3'].map(id => geometries.get(id)?.start);
    expect(starts[0]?.x).toBe(120);
    expect(starts[1]?.x).toBe(0);
    expect(starts[2]?.x).toBe(120);
    // e1 and e3 share the right side of card a, each at its own height.
    expect(starts[0]?.y).not.toBe(starts[2]?.y);
    expect(geometries.get('e3')?.mid.x).toBeGreaterThan(geometries.get('e1')?.mid.x ?? 0);
  });
});
