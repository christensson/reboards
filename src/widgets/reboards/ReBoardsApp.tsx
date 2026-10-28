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
    navigate({kind: 'board', boardId: last.id, sprint: prefs.lastSprintByBoard[last.id] ?? null}, true);
  }, [ready, route.kind, boards, prefs.lastBoardId, prefs.lastSprintByBoard, navigate]);

  useEffect(() => {
    if (route.kind === 'board' && prefs.lastBoardId !== route.boardId) {
      updatePrefs({lastBoardId: route.boardId});
    }
  }, [route, prefs.lastBoardId, updatePrefs]);

  // Sprints picked by date are shown in the URL but not remembered, so a later visit picks the then-current sprint.
  const autoSprints = useRef<Record<string, string>>({});
  const routeBoardId = route.kind === 'board' ? route.boardId : null;
  const routeSprint = route.kind === 'board' ? route.sprint : null;

  useEffect(() => {
    if (!ready || !routeBoardId) {
      return;
    }
    const stored = prefs.lastSprintByBoard[routeBoardId];
    const sprintsEnabled = boards.find(b => b.id === routeBoardId)?.sprints.enabled;
    if (routeSprint === null && stored && sprintsEnabled) {
      // Show the remembered sprint in the URL.
      navigate({kind: 'board', boardId: routeBoardId, sprint: stored}, true);
    } else if (routeSprint !== null && routeSprint !== stored && autoSprints.current[routeBoardId] !== routeSprint) {
      // A link that names a sprint becomes the remembered sprint.
      updatePrefs(prev => ({lastSprintByBoard: {...prev.lastSprintByBoard, [routeBoardId]: routeSprint}}));
    }
  }, [ready, routeBoardId, routeSprint, boards, prefs.lastSprintByBoard, navigate, updatePrefs]);

  const onAutoSelectSprint = useCallback(
    (sprint: string) => {
      if (routeBoardId) {
        autoSprints.current[routeBoardId] = sprint;
        navigate({kind: 'board', boardId: routeBoardId, sprint}, true);
      }
    },
    [routeBoardId, navigate]
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
    (boardId: string) => navigate({kind: 'board', boardId, sprint: prefs.lastSprintByBoard[boardId] ?? null}),
    [navigate, prefs.lastSprintByBoard]
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
      isNew={isNew}
      canEdit={isNew || boardsState.editableIds.has(board.id)}
      canDelete={!isNew && boardsState.deletableIds.has(board.id)}
      isAdmin={Boolean(boardsState.me?.isAdmin)}
      onSave={boardsState.save}
      onDelete={boardsState.remove}
      onCancel={() => (isNew && boards.length === 0 ? navigate({kind: 'home'}) : navigate(isNew ? {kind: 'home'} : {kind: 'board', boardId: board.id, sprint: null}))}
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
        prefs={prefs}
        updatePrefs={updatePrefs}
        onSelectBoard={openBoard}
        onAutoSelectSprint={onAutoSelectSprint}
        onSelectSprint={sprint => {
          delete autoSprints.current[board.id];
          updatePrefs(prev => ({lastSprintByBoard: {...prev.lastSprintByBoard, [board.id]: sprint ?? ''}}));
          navigate({kind: 'board', boardId: board.id, sprint});
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
