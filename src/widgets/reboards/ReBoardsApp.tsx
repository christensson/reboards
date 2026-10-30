import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Loader from '@jetbrains/ring-ui-built/components/loader/loader';
import addIcon from '@jetbrains/icons/add';
import {type BoardConfig, createEmptyBoard} from '@/common/model/board-config';
import {currentUserLogin, host, onAppLocationChange} from '@/common/youtrack/host';
import {BoardScreen} from './board/BoardScreen';
import {useBoards} from './data/useBoards';
import {usePrefs} from './hooks/usePrefs';
import {type Route, buildLocation, parseRoute} from './routing';
import {SettingsScreen} from './settings/SettingsScreen';

const useRoute = () => {
  const [route, setRoute] = useState<Route>({kind: 'home'});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const navigation = host.navigation;
    if (!navigation) {
      setReady(true);
      return undefined;
    }
    navigation.getAppLocation().then(location => {
      setRoute(parseRoute(location));
      setReady(true);
    });
    return onAppLocationChange(location => setRoute(parseRoute(location)));
  }, []);

  const navigate = useCallback((next: Route, replace = false) => {
    setRoute(next);
    const navigation = host.navigation;
    if (navigation) {
      const location = buildLocation(next);
      (replace ? navigation.replaceAppLocation(location) : navigation.updateAppLocation(location)).catch(() => undefined);
    }
  }, []);

  return {route, ready, navigate};
};

const NO_BOARD_ROUTE = {boardId: null, sprint: null, page: null};

/**
 * The sprint and page to show: those in the URL, else the remembered ones when the board uses
 * sprints (its own, or a linked agile board's) or pages.
 */
const withRemembered = (board: BoardConfig | undefined, sprint: string | null, page: string | null, storedSprint?: string, storedPage?: string) => {
  const sprintsEnabled = Boolean(board?.agileSource) || Boolean(board?.sprints.enabled);
  const pagesEnabled = Boolean(board) && board?.pages.mode !== 'none';
  return {
    sprint: sprint === null && storedSprint && sprintsEnabled ? storedSprint : sprint,
    page: page === null && storedPage && pagesEnabled ? storedPage : page
  };
};

/** A sprint or page in the URL that is not the remembered one, and was not picked automatically, becomes remembered. */
const isNewChoice = (value: string | null, stored: string | undefined, auto: string | undefined): value is string =>
  value !== null && value !== stored && value !== auto;

export const ReBoardsApp: React.FC = () => {
  const boardsState = useBoards();
  const {prefs, ready: prefsReady, update: updatePrefs} = usePrefs();
  const {route, ready: routeReady, navigate} = useRoute();

  const boards = useMemo(() => [...boardsState.boards].sort((a, b) => a.name.localeCompare(b.name)), [boardsState.boards]);
  const ready = routeReady && prefsReady && !boardsState.loading;

  // Resolve the home route to the last used (or first) board once everything is loaded.
  useEffect(() => {
    if (!ready || route.kind !== 'home' || boards.length === 0) {
      return;
    }
    const last = boards.find(b => b.id === prefs.lastBoardId) ?? boards[0];
    navigate({kind: 'board', boardId: last.id, sprint: prefs.lastSprintByBoard[last.id] ?? null, page: prefs.lastPageByBoard[last.id] || null}, true);
  }, [ready, route.kind, boards, prefs.lastBoardId, prefs.lastSprintByBoard, prefs.lastPageByBoard, navigate]);

  useEffect(() => {
    if (route.kind === 'board' && prefs.lastBoardId !== route.boardId) {
      updatePrefs({lastBoardId: route.boardId});
    }
  }, [route, prefs.lastBoardId, updatePrefs]);

  // Sprints picked by date, and default pages, are shown in the URL but not remembered, so a later
  // visit picks the then-current sprint and the then-default page.
  const autoSprints = useRef<Record<string, string>>({});
  const autoPages = useRef<Record<string, string>>({});
  const {boardId: routeBoardId, sprint: routeSprint, page: routePage} = route.kind === 'board' ? route : NO_BOARD_ROUTE;

  useEffect(() => {
    if (!ready || !routeBoardId) {
      return;
    }
    const storedSprint = prefs.lastSprintByBoard[routeBoardId];
    const storedPage = prefs.lastPageByBoard[routeBoardId];
    // Show the remembered sprint and page in the URL; both in one step, so neither undoes the other.
    const {sprint, page} = withRemembered(boards.find(b => b.id === routeBoardId), routeSprint, routePage, storedSprint, storedPage);
    if (sprint !== routeSprint || page !== routePage) {
      navigate({kind: 'board', boardId: routeBoardId, sprint, page}, true);
      return;
    }
    // A link that names a sprint or a page makes it the remembered one.
    if (isNewChoice(routeSprint, storedSprint, autoSprints.current[routeBoardId])) {
      updatePrefs(prev => ({lastSprintByBoard: {...prev.lastSprintByBoard, [routeBoardId]: routeSprint}}));
    }
    if (isNewChoice(routePage, storedPage, autoPages.current[routeBoardId])) {
      updatePrefs(prev => ({lastPageByBoard: {...prev.lastPageByBoard, [routeBoardId]: routePage}}));
    }
  }, [ready, routeBoardId, routeSprint, routePage, boards, prefs.lastSprintByBoard, prefs.lastPageByBoard, navigate, updatePrefs]);

  const onAutoSelectSprint = useCallback(
    (sprint: string) => {
      if (routeBoardId) {
        autoSprints.current[routeBoardId] = sprint;
        navigate({kind: 'board', boardId: routeBoardId, sprint, page: routePage}, true);
      }
    },
    [routeBoardId, routePage, navigate]
  );

  // The board shows its default page instead of a missing or unknown one: a remembered page that is gone is forgotten.
  const onAutoSelectPage = useCallback(
    (page: string | null) => {
      if (!routeBoardId) {
        return;
      }
      if (page) {
        autoPages.current[routeBoardId] = page;
      }
      updatePrefs(prev => {
        const {[routeBoardId]: _gone, ...rest} = prev.lastPageByBoard;
        return {lastPageByBoard: rest};
      });
      navigate({kind: 'board', boardId: routeBoardId, sprint: routeSprint, page}, true);
    },
    [routeBoardId, routeSprint, navigate, updatePrefs]
  );

  // Forget stars of boards that no longer exist.
  useEffect(() => {
    if (!ready) {
      return;
    }
    const known = new Set(boardsState.boards.map(b => b.id));
    if (prefs.starredBoards.some(id => !known.has(id))) {
      updatePrefs(prev => ({starredBoards: prev.starredBoards.filter(id => known.has(id))}));
    }
  }, [ready, boardsState.boards, prefs.starredBoards, updatePrefs]);

  const openBoard = useCallback(
    (boardId: string) => navigate({kind: 'board', boardId, sprint: prefs.lastSprintByBoard[boardId] ?? null, page: prefs.lastPageByBoard[boardId] || null}),
    [navigate, prefs.lastSprintByBoard, prefs.lastPageByBoard]
  );

  if (!ready) {
    return <div className="reboards-loading"><Loader message="Loading ReBoards…"/></div>;
  }

  if (boardsState.error) {
    return (
      <div className="reboards-empty">
        <p className="board-error">{`Could not load boards: ${boardsState.error}`}</p>
        <Button onClick={boardsState.reload}>Retry</Button>
      </div>
    );
  }

  const settingsFor = (board: BoardConfig, isNew: boolean) => (
    <SettingsScreen
      key={board.id || 'new'}
      board={board}
      boards={boards}
      isNew={isNew}
      canEdit={isNew || boardsState.editableIds.has(board.id)}
      canDelete={!isNew && boardsState.deletableIds.has(board.id)}
      isAdmin={Boolean(boardsState.me?.isAdmin)}
      onSave={boardsState.save}
      onDelete={boardsState.remove}
      onTransfer={async (id, login) => {
        if (!(await boardsState.transfer(id, login))) {
          navigate({kind: 'home'});
        }
      }}
      onCancel={() => (isNew && boards.length === 0 ? navigate({kind: 'home'}) : navigate(isNew ? {kind: 'home'} : {kind: 'board', boardId: board.id, sprint: null, page: null}))}
      onSaved={saved => openBoard(saved.id)}
    />
  );

  if (route.kind === 'new') {
    return settingsFor(createEmptyBoard(currentUserLogin() || boardsState.me?.login || ''), true);
  }

  if (route.kind === 'settings') {
    const board = boards.find(b => b.id === route.boardId);
    if (!board) {
      return <div className="reboards-empty"><p>Board not found.</p><Button onClick={() => navigate({kind: 'home'})}>Back</Button></div>;
    }
    return settingsFor(board, false);
  }

  if (route.kind === 'board') {
    const board = boards.find(b => b.id === route.boardId);
    if (!board) {
      return (
        <div className="reboards-empty">
          <p>This board does not exist or is not visible to you.</p>
          <Button onClick={() => navigate({kind: 'home'})}>Go to my boards</Button>
        </div>
      );
    }
    return (
      <BoardScreen
        key={board.id}
        board={board}
        boards={boards}
        sprint={route.sprint}
        page={route.page}
        prefs={prefs}
        updatePrefs={updatePrefs}
        onSelectBoard={openBoard}
        onAutoSelectSprint={onAutoSelectSprint}
        onSelectSprint={sprint => {
          delete autoSprints.current[board.id];
          updatePrefs(prev => ({lastSprintByBoard: {...prev.lastSprintByBoard, [board.id]: sprint ?? ''}}));
          navigate({kind: 'board', boardId: board.id, sprint, page: route.page});
        }}
        onAutoSelectPage={onAutoSelectPage}
        onSelectPage={page => {
          delete autoPages.current[board.id];
          updatePrefs(prev => ({lastPageByBoard: {...prev.lastPageByBoard, [board.id]: page ?? ''}}));
          navigate({kind: 'board', boardId: board.id, sprint: route.sprint, page});
        }}
        onNewBoard={() => navigate({kind: 'new'})}
        onOpenSettings={() => navigate({kind: 'settings', boardId: board.id})}
      />
    );
  }

  return (
    <div className="reboards-empty">
      <h2>Welcome to ReBoards</h2>
      <p>No boards yet. Create your first board to get started.</p>
      <Button primary icon={addIcon} onClick={() => navigate({kind: 'new'})}>Create board</Button>
    </div>
  );
};
