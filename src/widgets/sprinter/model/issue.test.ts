import {describe, expect, it} from 'vitest';
import type {YtIssue} from '@/common/youtrack/types';
import {compareIssues, normalizeIssue} from './issue';

const subtaskType = {id: '156-3', name: 'Subtask', sourceToTarget: 'parent for', targetToSource: 'subtask of', directed: true, aggregation: true};

const issue = (over: Partial<YtIssue>): YtIssue => ({
  id: '3-1', idReadable: 'SP-1', summary: 'One', project: {id: '0-3', shortName: 'SP'}, tags: [], customFields: [], links: [], ...over
});

describe('normalizeIssue', () => {
  it('maps fields, tags and subtask relations', () => {
    const result = normalizeIssue(issue({
      idReadable: 'SP-12',
      tags: [{id: 't1', name: 'urgent', color: {background: '#f00', foreground: '#fff'}}],
      customFields: [
        {id: 'f1', name: 'State2', $type: 'StateIssueCustomField', value: {name: 'Open', isResolved: false}},
        {id: 'f2', name: 'Assignee', $type: 'SingleUserIssueCustomField', value: null}
      ],
      links: [
        {id: 'l1', direction: 'INWARD', linkType: subtaskType, issues: [{id: '3-9', idReadable: 'SP-9'}]},
        {id: 'l2', direction: 'OUTWARD', linkType: subtaskType, issues: [{id: '3-20', idReadable: 'SP-20'}, {id: '3-21', idReadable: 'SP-21'}]},
        {id: 'l3', direction: 'BOTH', linkType: subtaskType, issues: []}
      ]
    }));
    expect(result.number).toBe(12);
    expect(result.fields.State2?.key).toBe('Open');
    expect(result.fields.Assignee).toBeNull();
    expect(result.tags[0].color?.background).toBe('#f00');
    expect(result.parentIds).toEqual(['3-9']);
    expect(result.childIds).toEqual(['3-20', '3-21']);
    expect(result.links).toHaveLength(2);
  });

  it('orders issues by project then number', () => {
    const a = normalizeIssue(issue({idReadable: 'SP-2'}));
    const b = normalizeIssue(issue({idReadable: 'SP-10'}));
    const c = normalizeIssue(issue({idReadable: 'AB-99', project: {id: '0-1', shortName: 'AB'}}));
    expect([b, a, c].sort(compareIssues).map(i => i.idReadable)).toEqual(['AB-99', 'SP-2', 'SP-10']);
  });
});
