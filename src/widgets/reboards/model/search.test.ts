import {describe, expect, it} from 'vitest';
import type {BoardIssue} from './issue';
import {computeMatchIds, findMatches, searchWords, splitForHighlight} from './search';

const issue = (id: string, idReadable: string, summary: string): BoardIssue => ({
  id, idReadable, summary, projectId: '', projectShortName: '', number: 0, tags: [], fields: {}, links: [], parentIds: [], childIds: []
});

describe('search', () => {
  const issues = [issue('1', 'SP-1', 'Login page crashes'), issue('2', 'SP-12', 'Crash on logout'), issue('3', 'AB-3', 'Other')];

  it('splits terms into words', () => {
    expect(searchWords('  Login   page ')).toEqual(['login', 'page']);
    expect(searchWords('   ')).toEqual([]);
  });

  it('matches id and summary substrings case-insensitively', () => {
    expect(findMatches(issues, 'crash')).toEqual(['1', '2']);
    expect(findMatches(issues, 'sp-1')).toEqual(['1', '2']);
    expect(findMatches(issues, '  ')).toEqual([]);
  });

  it('requires every word to match, each as a substring of the id or the summary', () => {
    expect(findMatches(issues, 'crash login')).toEqual(['1']);
    expect(findMatches(issues, 'sp-12 crash')).toEqual(['2']);
    expect(findMatches(issues, 'crash nowhere')).toEqual([]);
  });

  it('combines the text term with an unset-field quick filter', () => {
    const withAssignee = {...issue('4', 'SP-4', 'Crash again'), fields: {Assignee: {$type: 'x', key: 'u', label: 'U', labels: ['U'], keys: ['u']}}};
    const all = [...issues, withAssignee];
    expect(computeMatchIds(all, '', null)).toEqual(new Set());
    expect(computeMatchIds(all, '', 'Assignee')).toEqual(new Set(['1', '2', '3']));
    expect(computeMatchIds(all, 'crash', 'Assignee')).toEqual(new Set(['1', '2']));
    // Timing highlights match the issues that have the flag.
    expect(computeMatchIds(all, '', 'flag:overdue', {'2': ['overdue'], '3': ['late-start']})).toEqual(new Set(['2']));
    expect(computeMatchIds(all, 'crash', null)).toEqual(new Set(['1', '2', '4']));
  });

  it('splits text for highlighting with several words and overlapping matches', () => {
    expect(splitForHighlight('Crash on logout', ['o'])).toEqual([
      {text: 'Crash ', match: false}, {text: 'o', match: true}, {text: 'n l', match: false}, {text: 'o', match: true},
      {text: 'g', match: false}, {text: 'o', match: true}, {text: 'ut', match: false}
    ]);
    expect(splitForHighlight('Login page crashes', ['page', 'crash'])).toEqual([
      {text: 'Login ', match: false}, {text: 'page', match: true}, {text: ' ', match: false}, {text: 'crash', match: true}, {text: 'es', match: false}
    ]);
    expect(splitForHighlight('abcdef', ['abc', 'cde'])).toEqual([{text: 'abcde', match: true}, {text: 'f', match: false}]);
    expect(splitForHighlight('abc', [])).toEqual([{text: 'abc', match: false}]);
  });
});
