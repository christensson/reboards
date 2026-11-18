import {useEffect, useRef} from 'react';
import type {GanttRow} from '../../model/gantt';
import {type Step, currentIndex, firstChildIndex, nextRootIndex, parentRowIndex, rowIndexOf, stepIn, stepOut, stepVertical} from '../../model/ganttNav';
import type {NavMode} from '../useBoardKeys';
import {isDialogOpen, isTypingTarget} from '../useQuickFind';
import {KEY_ZOOM} from './useGanttZoom';

type Options = {
  /** False while the find box or a dialog of the board is open. */
  enabled: boolean;
  rows: GanttRow[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  /** The keyboard cursor's row key; it can be on a "without time" row, which has no issue to select. */
  cursor: string | null;
  setCursor: (key: string | null) => void;
  /** Collapses or expands a parent, or shows or hides a "without time" group. */
  toggleRow: (row: GanttRow) => void;
  onOpen: (issueId: string) => void;
  zoomBy: (factor: number) => void;
  onToggleConnectors: () => void;
  onHelp: () => void;
  /** C and Shift+C: collapse the deepest expanded level, or expand the shallowest collapsed one. */
  onCollapseLevel: () => void;
  onExpandLevel: () => void;
  /** Highlight navigation mode, when on: it takes Up and Down, and Enter and Escape finish it. */
  navMode: NavMode | null;
  scrollToRow: (key: string) => void;
};

/** + and − zoom; = is + without Shift on most layouts. */
const ZOOM_KEYS: Record<string, number> = {'+': KEY_ZOOM, '=': KEY_ZOOM, '-': 1 / KEY_ZOOM};

const isPressable = (element: Element | null): boolean => element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement;

/**
 * The board's shortcuts in the Gantt chart, listened to on the window like the board's:
 * - Up and Down go to the previous and next row; Left collapses or goes to the parent, Right
 *   expands or goes to the first subtask;
 * - Enter opens the issue, or shows or hides the issues of a "without time" row (Space too);
 * - P selects the parent, Shift+P goes back to the subtask or else to the first subtask;
 * - S and Shift+S go to the next and previous top-level issue;
 * - R shows or hides relations, + and − zoom, C and Shift+C collapse or expand one level,
 *   Escape clears the selection, ? lists the keys.
 * Ctrl+arrows (moving cards on the board) do nothing: the chart is read-only.
 */
export const useGanttKeys = (options: Options): void => {
  const latest = useRef(options);
  latest.current = options;
  /** P remembers the subtask it left, for Shift+P to come back to. */
  const cameFrom = useRef<{parent: string; child: string} | null>(null);
  /** Shift+P on a collapsed parent: its first subtask is selected once it is expanded. */
  const pendingChild = useRef<string | null>(null);

  const goTo = (index: number): void => {
    const {rows, setSelectedIds, setCursor, scrollToRow} = latest.current;
    const row = rows[index];
    if (!row) {
      return;
    }
    setCursor(row.key);
    setSelectedIds(row.type === 'issue' ? new Set([row.issue.id]) : new Set());
    scrollToRow(row.key);
  };

  // A parent expanded by Shift+P: go to its first subtask once it shows.
  useEffect(() => {
    const parent = pendingChild.current;
    const at = parent === null ? -1 : rowIndexOf(options.rows, parent);
    if (parent === null || at < 0) {
      return;
    }
    pendingChild.current = null;
    const child = firstChildIndex(options.rows, at);
    if (child >= 0) {
      goTo(child);
    }
     
  }, [options.rows]);

  useEffect(() => {
    const apply = (step: Step, at: number): void => {
      const {rows, toggleRow} = latest.current;
      if (step === 'toggle') {
        toggleRow(rows[at]);
      } else if (step) {
        goTo(step.to);
      }
    };

    const toParent = (at: number): void => {
      const {rows} = latest.current;
      const row = rows[at];
      const parent = parentRowIndex(rows, at);
      const parentRow = rows[parent];
      if (row?.type === 'issue' && parentRow?.type === 'issue') {
        cameFrom.current = {parent: parentRow.issue.id, child: row.issue.id};
        goTo(parent);
      }
    };

    const toChild = (at: number): void => {
      const {rows, selectedIds, toggleRow} = latest.current;
      const row = rows[at];
      if (row?.type !== 'issue') {
        return;
      }
      const back = cameFrom.current;
      const backAt = back && back.parent === row.issue.id && selectedIds.has(row.issue.id) ? rowIndexOf(rows, back.child) : -1;
      if (backAt >= 0) {
        goTo(backAt);
      } else if (row.collapsed && (row.childCount > 0 || row.undatedChildIds.length > 0)) {
        pendingChild.current = row.issue.id;
        toggleRow(row);
      } else if (firstChildIndex(rows, at) >= 0) {
        goTo(firstChildIndex(rows, at));
      }
    };

    const onArrow = (key: string, at: number): boolean => {
      const {rows, navMode} = latest.current;
      const vertical = key === 'ArrowDown' ? 1 : -1;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (navMode?.onArrow(vertical > 0 ? 'down' : 'up')) {
          return true;
        }
        apply(stepVertical(rows, at, vertical), at);
        return true;
      }
      navMode?.exit();
      if (key === 'ArrowRight') {
        apply(stepIn(rows, at), at);
      } else if (key === 'ArrowLeft') {
        apply(stepOut(rows, at), at);
      } else {
        return false;
      }
      return true;
    };

    const onEnter = (key: string, at: number): boolean => {
      const {rows, navMode, onOpen, toggleRow} = latest.current;
      if (key === 'Enter' && navMode?.finish) {
        navMode.finish();
        return true;
      }
      const row = rows[at];
      if (row?.type === 'undated') {
        toggleRow(row);
        return true;
      }
      if (row && key === 'Enter') {
        onOpen(row.issue.id);
        return true;
      }
      return false;
    };

    const onEscape = (): void => {
      const {navMode, setSelectedIds, setCursor} = latest.current;
      if (navMode) {
        (navMode.finish ?? navMode.exit)();
        return;
      }
      setSelectedIds(new Set());
      setCursor(null);
    };

    /** Keys that go somewhere: P, Shift+P, S and Shift+S. */
    const onJump = (key: string, at: number): boolean => {
      const {rows} = latest.current;
      if (key === 'p') {
        toParent(at);
      } else if (key === 'P') {
        toChild(at);
      } else if (key === 's' || key === 'S') {
        const root = nextRootIndex(rows, at, key === 's' ? 1 : -1);
        if (root >= 0) {
          goTo(root);
        }
      } else {
        return false;
      }
      return true;
    };

    /** Keys that act on the view: R, ?, Escape and zoom. */
    const onViewKey = (key: string): boolean => {
      const {onToggleConnectors, onHelp, zoomBy, onCollapseLevel, onExpandLevel} = latest.current;
      if (ZOOM_KEYS[key]) {
        zoomBy(ZOOM_KEYS[key]);
      } else if (key === 'c' || key === 'C') {
        (key === 'c' ? onCollapseLevel : onExpandLevel)();
      } else if (key === 'r') {
        onToggleConnectors();
      } else if (key === '?') {
        onHelp();
      } else if (key === 'Escape') {
        onEscape();
      } else {
        return false;
      }
      return true;
    };

    const onKey = (event: KeyboardEvent): boolean => {
      const {rows, cursor, selectedIds} = latest.current;
      const at = currentIndex(rows, cursor, selectedIds);
      if (event.key.startsWith('Arrow')) {
        return onArrow(event.key, at);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        return onEnter(event.key, at);
      }
      return onJump(event.key, at) || onViewKey(event.key);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const {enabled, rows} = latest.current;
      if (!enabled || rows.length === 0 || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isTypingTarget(document.activeElement) || isDialogOpen()) {
        return;
      }
      // Enter and Space on a focused button or link press it.
      if ((event.key === 'Enter' || event.key === ' ') && isPressable(document.activeElement)) {
        return;
      }
      if (onKey(event)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
     
  }, []);
};
