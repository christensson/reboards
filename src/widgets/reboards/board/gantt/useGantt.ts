import {useCallback, useEffect, useMemo, useState} from 'react';
import type {BoardConfig, RowMode} from '@/common/model/board-config';
import {type GanttZoom, type UserPrefs, toggleInBoardList} from '@/common/storage/prefs';
import type {FieldUniverse} from '../../model/fieldUniverse';
import {revealFor, visibleGantt} from '../../model/gantt';
import {PX_PER_DAY, clampPxPerDay} from '../../model/ganttScale';
import type {BoardIssue} from '../../model/issue';

type UpdatePrefs = (patch: Partial<UserPrefs> | ((prev: UserPrefs) => Partial<UserPrefs>)) => void;

const DEFAULT_PX_PER_DAY = PX_PER_DAY.week;
/** Zooming with the wheel changes the width many times a second; it is stored once it settles. */
const SAVE_DELAY = 500;

/** The day width shown, kept here while zooming and stored in the prefs once it settles. */
const usePxPerDay = (boardId: string, prefs: UserPrefs, updatePrefs: UpdatePrefs) => {
  const stored = prefs.ganttPxPerDay[boardId] ?? DEFAULT_PX_PER_DAY;
  const [shown, setShown] = useState<{boardId: string; px: number} | null>(null);
  const pxPerDay = shown?.boardId === boardId ? shown.px : stored;
  useEffect(() => {
    if (!shown || shown.px === stored) {
      return undefined;
    }
    const timer = window.setTimeout(() => updatePrefs(prev => ({ganttPxPerDay: {...prev.ganttPxPerDay, [shown.boardId]: shown.px}})), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [shown, stored, updatePrefs]);
  const setPxPerDay = useCallback((px: number) => setShown({boardId, px: clampPxPerDay(px)}), [boardId]);
  return [pxPerDay, setPxPerDay] as const;
};

/** The Gantt layout's per-user state for a board: zoom, collapsed parents, listed issues without time. */
export const useGantt = (board: BoardConfig, rowMode: RowMode, prefs: UserPrefs, updatePrefs: UpdatePrefs, issues: BoardIssue[], universe: FieldUniverse) => {
  const [todaySignal, setTodaySignal] = useState(0);
  const [fitSignal, setFitSignal] = useState(0);
  const [pxPerDay, setPxPerDay] = usePxPerDay(board.id, prefs, updatePrefs);
  const collapsed = useMemo(() => new Set(prefs.ganttCollapsed[board.id] ?? []), [prefs.ganttCollapsed, board.id]);
  const showUndated = useMemo(() => new Set(prefs.ganttShowUndated[board.id] ?? []), [prefs.ganttShowUndated, board.id]);
  const active = rowMode === 'gantt';
  const hiddenLevels = useMemo(() => prefs.ganttHiddenLevels[board.id] ?? [], [prefs.ganttHiddenLevels, board.id]);
  /** The plan with the levels this user shows; the Gantt chart works as if the board had only those. */
  const shownGantt = useMemo(() => visibleGantt(board.gantt, hiddenLevels), [board.gantt, hiddenLevels]);
  /** Shows or hides a planning level; the last one shown stays. */
  const toggleLevel = useCallback((levelId: string) => updatePrefs(prev => {
    const hidden = (prev.ganttHiddenLevels[board.id] ?? []).filter(id => board.gantt.levels.some(level => level.id === id));
    const next = hidden.includes(levelId) ? hidden.filter(id => id !== levelId) : [...hidden, levelId];
    if (next.length >= board.gantt.levels.length) {
      return {};
    }
    return {ganttHiddenLevels: {...prev.ganttHiddenLevels, [board.id]: next}};
  }), [board.gantt.levels, board.id, updatePrefs]);
  /** Expands the parents and the "without time" group that hide an issue. */
  const reveal = useCallback((issueId: string) => {
    const found = revealFor({issues, gantt: shownGantt, universe, now: Date.now()}, issueId);
    if (!found || (found.expand.length === 0 && !found.showUndated)) {
      return;
    }
    const boardId = board.id;
    updatePrefs(prev => {
      const shown = prev.ganttShowUndated[boardId] ?? [];
      return {
        ganttCollapsed: {...prev.ganttCollapsed, [boardId]: (prev.ganttCollapsed[boardId] ?? []).filter(id => !found.expand.includes(id))},
        ganttShowUndated: found.showUndated && !shown.includes(found.showUndated)
          ? {...prev.ganttShowUndated, [boardId]: [...shown, found.showUndated]}
          : prev.ganttShowUndated
      };
    });
  }, [issues, shownGantt, board.id, universe, updatePrefs]);
  const onPreset = useCallback((zoom: GanttZoom) => setPxPerDay(PX_PER_DAY[zoom]), [setPxPerDay]);
  const onFit = useCallback(() => setFitSignal(value => value + 1), []);
  const onToday = useCallback(() => setTodaySignal(value => value + 1), []);
  const onControlsCollapsed = useCallback((fewer: boolean) => updatePrefs({ganttControlsCollapsed: fewer}), [updatePrefs]);
  return {
    active,
    reveal,
    view: {
      shownGantt,
      hiddenLevels,
      onToggleLevel: toggleLevel,
      pxPerDay,
      onPxPerDay: setPxPerDay,
      onPreset,
      onFit,
      onToday,
      controlsCollapsed: prefs.ganttControlsCollapsed,
      onControlsCollapsed,
      collapsed,
      showUndated,
      todaySignal,
      fitSignal,
      /** Collapses (or expands) several parents at once: a whole level. */
      onSetCollapsed: (issueIds: string[], collapse: boolean) => updatePrefs(prev => {
        const current = new Set(prev.ganttCollapsed[board.id] ?? []);
        issueIds.forEach(id => (collapse ? current.add(id) : current.delete(id)));
        return {ganttCollapsed: {...prev.ganttCollapsed, [board.id]: Array.from(current)}};
      }),
      onToggleCollapsed: (issueId: string) => updatePrefs(prev => ({ganttCollapsed: toggleInBoardList(prev.ganttCollapsed, board.id, issueId)})),
      onToggleUndated: (key: string) => updatePrefs(prev => ({ganttShowUndated: toggleInBoardList(prev.ganttShowUndated, board.id, key)}))
    }
  };
};
