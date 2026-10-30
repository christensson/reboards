import {describe, expect, it} from 'vitest';
import type {HostAPI} from '../../../@types/globals';
import {PREFS_KEY, type UserPrefs, boardView, defaultPrefs, loadPrefs, setBoardView, toggleStar, toggleStarredPage} from './prefs';

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

const hostWith = (stored: unknown): HostAPI => ({
  storage: {getItem: async (key: string) => (key === PREFS_KEY ? JSON.stringify(stored) : null), setItem: async () => undefined}
}) as unknown as HostAPI;

describe('page prefs', () => {
  it('loads prefs stored before pages existed', async () => {
    const prefs = await loadPrefs(hostWith({cardSize: 'small', starredBoards: ['a']}));
    expect(prefs.cardSize).toBe('small');
    expect(prefs.lastPageByBoard).toEqual({});
    expect(prefs.starredPagesByBoard).toEqual({});
  });

  it('drops corrupt page entries', async () => {
    const prefs = await loadPrefs(hostWith({lastPageByBoard: {a: 'x', b: 3}, starredPagesByBoard: {a: ['x', 1], b: 'y'}}));
    expect(prefs.lastPageByBoard).toEqual({a: 'x'});
    expect(prefs.starredPagesByBoard).toEqual({a: ['x']});
    expect((await loadPrefs(hostWith({lastPageByBoard: [1], starredPagesByBoard: null}))).starredPagesByBoard).toEqual({});
  });

  it('toggles page stars per board and forgets pages that are gone', () => {
    const keys = ['x', 'y'];
    let prefs = apply(defaultPrefs(), toggleStarredPage(defaultPrefs(), 'a', 'x', keys));
    prefs = apply(prefs, toggleStarredPage(prefs, 'b', 'y', keys));
    expect(prefs.starredPagesByBoard).toEqual({a: ['x'], b: ['y']});
    prefs = {...prefs, starredPagesByBoard: {...prefs.starredPagesByBoard, a: ['x', 'gone']}};
    prefs = apply(prefs, toggleStarredPage(prefs, 'a', 'y', keys));
    expect(prefs.starredPagesByBoard.a).toEqual(['x', 'y']);
    prefs = apply(prefs, toggleStarredPage(prefs, 'a', 'x', keys));
    expect(prefs.starredPagesByBoard.a).toEqual(['y']);
  });
});
