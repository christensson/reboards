import {describe, expect, it} from 'vitest';
import {type BoardConfig, createEmptyBoard} from './board-config';
import {detectLostWrite, mergeBoards, resolveMerge, summarizeGroup} from './board-merge';

const base: BoardConfig = {
  ...createEmptyBoard('alice'),
  id: 'b1',
  name: 'Board',
  projects: [{id: '0-1', shortName: 'SAN'}],
  query: '#Unresolved',
  columns: [{id: 'c1', values: ['Open']}, {id: 'c2', values: ['Done']}],
  version: 3,
  updatedAt: 100
};

describe('mergeBoards', () => {
  it('keeps my changes and takes theirs where only they changed something', () => {
    const mine = {...base, name: 'Renamed'};
    const theirs = {...base, query: '#Bug', version: 4, updatedAt: 200};
    const {merged, theirsApplied, conflicts} = mergeBoards(base, mine, theirs);
    expect(merged.name).toBe('Renamed');
    expect(merged.query).toBe('#Bug');
    expect(theirsApplied).toEqual(['query']);
    expect(conflicts).toEqual([]);
  });

  it('takes the server fields from theirs, so the next save names their version', () => {
    const merged = mergeBoards(base, {...base, name: 'Mine'}, {...base, owner: 'bob', ownerId: 'ring-bob', version: 5, updatedAt: 300}).merged;
    expect(merged).toMatchObject({owner: 'bob', ownerId: 'ring-bob', version: 5, updatedAt: 300});
  });

  it('is no conflict when both made the same change', () => {
    const same = {...base, name: 'Same'};
    expect(mergeBoards(base, same, {...same, version: 4}).conflicts).toEqual([]);
  });

  it('reports a conflict when both changed a setting differently', () => {
    const result = mergeBoards(base, {...base, query: '#Mine'}, {...base, query: '#Theirs', version: 4});
    expect(result.conflicts).toEqual(['query']);
    expect(result.merged.query).toBe('#Mine');
  });

  it('merges a column field and its columns as one group', () => {
    const mine = {...base, ignoredValues: ['Blocked']};
    const theirs = {...base, columns: [{id: 'c1', values: ['Open', 'In Progress']}, {id: 'c2', values: ['Done']}], version: 4};
    expect(mergeBoards(base, mine, theirs).conflicts).toEqual(['columns']);
  });

  it('applies the chosen side of each conflict', () => {
    const theirs = {...base, query: '#Theirs', name: 'Theirs', version: 4};
    const result = mergeBoards(base, {...base, query: '#Mine', name: 'Mine'}, theirs);
    const resolved = resolveMerge(result, theirs, {query: 'theirs'});
    expect(resolved.query).toBe('#Theirs');
    expect(resolved.name).toBe('Mine');
  });

  it('summarizes both sides readably', () => {
    expect(summarizeGroup('columns', base)).toBe('State: Open, Done');
    expect(summarizeGroup('shared', base)).toBe('Personal');
    expect(summarizeGroup('query', {...base, query: 'x'.repeat(500)}).length).toBe(120);
  });
});

describe('detectLostWrite', () => {
  const saved = {...base, version: 4, updatedAt: 200};

  it('sees our write, or a later one on top of it, as kept', () => {
    expect(detectLostWrite(saved, [saved])).toBe('kept');
    expect(detectLostWrite(saved, [{...saved, version: 5, updatedAt: 300}])).toBe('kept');
  });

  it('sees an older version or a simultaneous save of the same board as overwritten', () => {
    expect(detectLostWrite(saved, [base])).toBe('overwritten');
    expect(detectLostWrite(saved, [{...saved, updatedAt: 201}])).toBe('overwritten');
  });

  it('sees a missing board as gone', () => {
    expect(detectLostWrite(saved, [])).toBe('gone');
  });
});
