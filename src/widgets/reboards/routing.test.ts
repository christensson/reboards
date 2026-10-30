import {describe, expect, it} from 'vitest';
import {buildLocation, parseRoute} from './routing';

describe('routing', () => {
  it('parses routes', () => {
    expect(parseRoute({pathname: '/', search: ''})).toEqual({kind: 'home'});
    expect(parseRoute({pathname: '/boards/new', search: ''})).toEqual({kind: 'new'});
    expect(parseRoute({pathname: '/boards/abc', search: ''})).toEqual({kind: 'board', boardId: 'abc', sprint: null, page: null});
    expect(parseRoute({pathname: '/boards/abc', search: 'sprint=Sprint+1'})).toEqual({kind: 'board', boardId: 'abc', sprint: 'Sprint 1', page: null});
    expect(parseRoute({pathname: '/boards/abc', search: 'page=In+Progress&sprint=S1'})).toEqual({kind: 'board', boardId: 'abc', sprint: 'S1', page: 'In Progress'});
    expect(parseRoute({pathname: '/boards/abc/settings', search: 'sprint=x'})).toEqual({kind: 'settings', boardId: 'abc'});
    expect(parseRoute({pathname: '/other', search: ''})).toEqual({kind: 'home'});
  });

  it('builds locations that parse back', () => {
    const routes = [
      {kind: 'home'},
      {kind: 'new'},
      {kind: 'board', boardId: 'a b', sprint: 'Sprint 2', page: null},
      {kind: 'board', boardId: 'a b', sprint: 'Sprint 2', page: 'Fix & test'},
      {kind: 'board', boardId: 'a', sprint: null, page: '__none__'},
      {kind: 'board', boardId: 'x', sprint: null, page: null},
      {kind: 'settings', boardId: 'x'}
    ] as const;
    routes.forEach(route => {
      expect(parseRoute(buildLocation(route))).toEqual(route);
    });
  });
});
