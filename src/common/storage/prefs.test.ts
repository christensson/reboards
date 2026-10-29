import {describe, expect, it} from 'vitest';
import {type UserPrefs, boardView, defaultPrefs, setBoardView, toggleStar} from './prefs';

const apply = (prefs: UserPrefs, patch: Partial<UserPrefs>): UserPrefs => ({...prefs, ...patch});

describe('board view prefs', () => {
  it('falls back to the last used settings for boards without a stored view', () => {
    const prefs = {...defaultPrefs(), cardSize: 'small' as const};
    expect(boardView(prefs, 'x')).toEqual({cardSize: 'small', connectorsMode: 'selected', showNewIssue: true, groupByParent: true});
  });

  it('remembers settings per board and updates the default', () => {
    let prefs = apply(defaultPrefs(), setBoardView(defaultPrefs(), 'a', {cardSize: 'small'}));
    prefs = apply(prefs, setBoardView(prefs, 'b', {connectorsMode: 'all'}));
    expect(boardView(prefs, 'a')).toEqual({cardSize: 'small', connectorsMode: 'all', showNewIssue: true, groupByParent: true});
    expect(boardView(prefs, 'b')).toEqual({cardSize: 'small', connectorsMode: 'all', showNewIssue: true, groupByParent: true});
    prefs = apply(prefs, setBoardView(prefs, 'a', {connectorsMode: 'none'}));
    prefs = apply(prefs, setBoardView(prefs, 'b', {cardSize: 'normal'}));
    expect(boardView(prefs, 'a')).toEqual({cardSize: 'small', connectorsMode: 'none', showNewIssue: true, groupByParent: true});
    expect(boardView(prefs, 'b')).toEqual({cardSize: 'normal', connectorsMode: 'all', showNewIssue: true, groupByParent: true});
  });

  it('remembers whether new-issue controls are shown', () => {
    let prefs = apply(defaultPrefs(), setBoardView(defaultPrefs(), 'a', {showNewIssue: false}));
    expect(boardView(prefs, 'a').showNewIssue).toBe(false);
    expect(boardView(prefs, 'new').showNewIssue).toBe(false);
    prefs = apply(prefs, setBoardView(prefs, 'b', {showNewIssue: true}));
    expect(boardView(prefs, 'a').showNewIssue).toBe(false);
    expect(boardView(prefs, 'b').showNewIssue).toBe(true);
  });

  it('toggles stars', () => {
    let prefs = apply(defaultPrefs(), toggleStar(defaultPrefs(), 'a'));
    expect(prefs.starredBoards).toEqual(['a']);
    prefs = apply(prefs, toggleStar(prefs, 'a'));
    expect(prefs.starredBoards).toEqual([]);
  });
});
