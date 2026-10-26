import {describe, expect, it} from 'vitest';
import {computeEdges, edgeGeometry} from './connectors';
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

describe('edgeGeometry', () => {
  it('leaves horizontally when the target is to the right', () => {
    const g = edgeGeometry({x: 0, y: 0, width: 100, height: 40}, {x: 300, y: 0, width: 100, height: 40});
    expect(g.start).toEqual({x: 100, y: 20});
    expect(g.end).toEqual({x: 300, y: 20});
    expect(g.mid).toEqual({x: 200, y: 20});
    expect(g.path.startsWith('M 100 20 C')).toBe(true);
    const tilted = edgeGeometry({x: 0, y: 0, width: 100, height: 40}, {x: 300, y: 100, width: 100, height: 40});
    expect(tilted.path).toBe('M 100 20 C 200 40, 200 100, 300 120');
  });

  it('loops out of the side for cards stacked in one column, alternating sides per lane', () => {
    const from = {x: 0, y: 0, width: 100, height: 40};
    const to = {x: 0, y: 200, width: 100, height: 40};
    const right = edgeGeometry(from, to, 0);
    expect(right.start).toEqual({x: 100, y: 20});
    expect(right.end).toEqual({x: 100, y: 220});
    expect(right.mid.x).toBeGreaterThan(100);
    const left = edgeGeometry(from, to, 1);
    expect(left.start).toEqual({x: 0, y: 20});
    expect(left.mid.x).toBeLessThan(0);
    const wider = edgeGeometry(from, to, 2);
    expect(wider.mid.x).toBeGreaterThan(right.mid.x);
  });

  it('uses an S-curve for cards in different columns even when far apart vertically', () => {
    const g = edgeGeometry({x: 0, y: 0, width: 100, height: 40}, {x: 300, y: 400, width: 100, height: 40});
    expect(g.start).toEqual({x: 100, y: 20});
    expect(g.end).toEqual({x: 300, y: 420});
    expect(edgeGeometry({x: 0, y: 0, width: 100, height: 40}, {x: 300, y: 400, width: 100, height: 40}, 1).start.y).toBe(14);
  });
});
