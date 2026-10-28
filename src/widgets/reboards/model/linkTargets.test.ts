import {describe, expect, it} from 'vitest';
import type {YtIssueLinkType} from '@/common/youtrack/types';
import type {BoardIssue} from './issue';
import {isDescendant, modeFromKeys, relationOptions, resolveLinkTarget} from './linkTargets';

const issue = (id: string, parentIds: string[] = [], childIds: string[] = []): BoardIssue => ({
  id,
  idReadable: `SP-${id}`,
  summary: '',
  projectId: 'p',
  projectShortName: 'SP',
  number: Number(id),
  tags: [],
  fields: {},
  links: [],
  parentIds,
  childIds
});

const byId = (...issues: BoardIssue[]) => new Map(issues.map(i => [i.id, i]));

describe('link targets', () => {
  const a = issue('1', ['9'], ['2']);
  const b = issue('2', ['1'], ['3']);
  const c = issue('3', ['2']);
  const d = issue('4');
  const all = byId(a, b, c, d);

  it('maps modifier keys to modes', () => {
    expect(modeFromKeys({ctrlKey: false, metaKey: false, shiftKey: true})).toBe('none');
    expect(modeFromKeys({ctrlKey: true, metaKey: false, shiftKey: false})).toBe('parent');
    expect(modeFromKeys({ctrlKey: false, metaKey: true, shiftKey: true})).toBe('relation');
  });

  it('finds descendants', () => {
    expect(isDescendant('1', '3', all)).toBe(true);
    expect(isDescendant('1', '4', all)).toBe(false);
  });

  it('resolves card and group targets', () => {
    expect(resolveLinkTarget({kind: 'link-card', issueId: '4'}, a, 'parent', all)).toEqual({targetId: '4', targetLabel: 'SP-4'});
    expect(resolveLinkTarget({kind: 'link-group', groupKey: 'g', parentId: '7', parentIdReadable: 'SP-7'}, a, 'parent', all))
      .toEqual({targetId: '7', targetLabel: 'SP-7'});
  });

  it('refuses itself, descendants and the current parent in parent mode', () => {
    expect(resolveLinkTarget({kind: 'link-card', issueId: '1'}, a, 'relation', all)).toHaveProperty('invalid');
    expect(resolveLinkTarget({kind: 'link-card', issueId: '3'}, a, 'parent', all)).toEqual({invalid: 'SP-3 is a subtask of SP-1 and can\'t become its parent'});
    expect(resolveLinkTarget({kind: 'link-group', groupKey: 'g', parentId: '9', parentIdReadable: 'SP-9'}, a, 'parent', all))
      .toEqual({invalid: 'SP-9 is already the parent of SP-1'});
    expect(resolveLinkTarget({kind: 'link-card', issueId: '3'}, a, 'relation', all)).toEqual({targetId: '3', targetLabel: 'SP-3'});
  });
});

describe('relationOptions', () => {
  const types: YtIssueLinkType[] = [
    {id: '156-0', name: 'Relates', sourceToTarget: 'relates to', targetToSource: '', directed: false, aggregation: false},
    {id: '156-1', name: 'Depend', sourceToTarget: 'is required for', targetToSource: 'depends on', directed: true, aggregation: false},
    {id: '156-3', name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of', directed: true, aggregation: true}
  ];
  const from = {...issue('1'), links: [{typeId: '156-1', typeName: 'Depend', sourceToTarget: '', targetToSource: '', directed: true, aggregation: false, direction: 'INWARD' as const, issueIds: ['2']}]};

  it('phrases every end from the dragged issue with REST link ids', () => {
    const options = relationOptions(types, from, {id: '2'});
    expect(options.map(o => [o.verb, o.existing])).toEqual([
      ['relates to', false],
      ['depends on', true],
      ['is required for', false],
      ['subtask of', false],
      ['parent for', false]
    ]);
    expect(options[0].action).toEqual({kind: 'link', issueId: '1', linkId: '156-0', otherId: '2'});
    expect(options[2].action).toEqual({kind: 'link', issueId: '1', linkId: '156-1s', otherId: '2'});
    expect(options[3].action).toEqual({kind: 'parent', childId: '1', parentId: '2'});
    expect(options[4].action).toEqual({kind: 'parent', childId: '2', parentId: '1'});
  });
});
