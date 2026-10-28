import type {AppLocation} from '../../../@types/globals';

export type Route =
  | {kind: 'home'}
  | {kind: 'new'}
  | {kind: 'board'; boardId: string; sprint: string | null}
  | {kind: 'settings'; boardId: string};

export const parseRoute = (location: Pick<AppLocation, 'pathname' | 'search'>): Route => {
  const segments = location.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'boards' || segments.length < 2) {
    return {kind: 'home'};
  }
  if (segments[1] === 'new') {
    return {kind: 'new'};
  }
  const boardId = decodeURIComponent(segments[1]);
  if (segments[2] === 'settings') {
    return {kind: 'settings', boardId};
  }
  const sprint = new URLSearchParams(location.search).get('sprint');
  return {kind: 'board', boardId, sprint};
};

export const buildLocation = (route: Route): Pick<AppLocation, 'pathname' | 'search'> => {
  switch (route.kind) {
    case 'home':
      return {pathname: '/', search: ''};
    case 'new':
      return {pathname: '/boards/new', search: ''};
    case 'settings':
      return {pathname: `/boards/${encodeURIComponent(route.boardId)}/settings`, search: ''};
    case 'board': {
      const params = new URLSearchParams();
      if (route.sprint) {
        params.set('sprint', route.sprint);
      }
      return {pathname: `/boards/${encodeURIComponent(route.boardId)}`, search: params.toString()};
    }
    default:
      return {pathname: '/', search: ''};
  }
};
