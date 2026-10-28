import {describe, expect, it} from 'vitest';
import {composeQuery, quoteToken} from './query';

describe('quoteToken', () => {
  it('braces tokens with spaces or special characters', () => {
    expect(quoteToken('SP')).toBe('SP');
    expect(quoteToken('Sprint 1')).toBe('{Sprint 1}');
    expect(quoteToken('v1.0-beta')).toBe('v1.0-beta');
    expect(quoteToken('a:b')).toBe('{a:b}');
  });
});

describe('composeQuery', () => {
  it('scopes to projects only', () => {
    expect(composeQuery({projects: ['SP', 'my proj'], query: ''})).toBe('project: SP, {my proj}');
  });

  it('wraps the user query in parentheses when combined', () => {
    expect(composeQuery({projects: ['SP'], query: ' #Unresolved or Type: Bug '}))
      .toBe('project: SP and (#Unresolved or Type: Bug)');
  });

  it('adds the sprint clause', () => {
    expect(composeQuery({projects: ['SP'], query: '#Unresolved', sprintField: 'Sprints', sprint: 'Sprint 1'}))
      .toBe('project: SP and (#Unresolved) and Sprints: {Sprint 1}');
  });

  it('shows unscheduled issues when no sprint is selected', () => {
    expect(composeQuery({projects: [], query: 'Type: Bug', sprintField: 'Sprints', sprint: null})).toBe('Type: Bug and has: -Sprints');
    expect(composeQuery({projects: ['SP'], query: '', sprintField: 'Fix versions', sprint: ''})).toBe('project: SP and has: -{Fix versions}');
  });

  it('omits the sprint clause without a sprint field', () => {
    expect(composeQuery({projects: ['SP'], query: '', sprintField: null, sprint: null})).toBe('project: SP');
  });
});
