import {useCallback, useEffect, useMemo, useState} from 'react';
import type {BoardIssue} from '../model/issue';
import type {Direction} from '../model/keyboardNav';
import type {BoardLayout} from '../model/layout';
import {navParent, navStatus, siblingStep} from '../model/subtaskNav';

type Options = {
  layout: BoardLayout;
  issuesById: Map<string, BoardIssue>;
  selectedIds: Set<string>;
  /** Selects a parent of the issue (`preferred` when it is one) and returns it, or null. */
  goToParent: (issueId: string, preferred: string | null) => string | null;
  /** Selects a subtask of the issue and returns it, or null. */
  goToChild: (issueId: string) => string | null;
  goToCard: (issueId: string) => void;
};

type SubtaskNav = {
  active: boolean;
  /** Where the mode is, for the banner: "SP-4: Subtask 2 of 3 with parent SP-1, 5 subtasks."; null when off. */
  status: string | null;
  /** P and Shift+P: go up or down, starting the mode when they get somewhere. */
  upToParent: (issueId: string) => void;
  downToChild: (issueId: string) => void;
  /** An arrow key while the mode is on. */
  step: (direction: Direction) => void;
  exit: () => void;
};

/**
 * Subtask navigation mode, entered with P or Shift+P: Up goes to the parent, Down to a subtask,
 * Left and Right to the previous and next subtask of the same parent, wrapping around. It ends with
 * Escape, or when the selection changes some other way.
 */
export const useSubtaskNav = ({layout, issuesById, selectedIds, goToParent, goToChild, goToCard}: Options): SubtaskNav => {
  // The selected issue, and the parent whose subtasks Left and Right step through (null: none on the board).
  const [nav, setNav] = useState<{current: string; parent: string | null} | null>(null);

  const enter = useCallback((current: string | null, preferredParent: string | null) => {
    if (current) {
      setNav({current, parent: navParent(issuesById.get(current), layout, preferredParent)});
    }
  }, [issuesById, layout]);

  const upToParent = useCallback((issueId: string) => enter(goToParent(issueId, nav?.parent ?? null), null), [enter, goToParent, nav]);
  const downToChild = useCallback((issueId: string) => enter(goToChild(issueId), issueId), [enter, goToChild]);

  const step = useCallback((direction: Direction) => {
    if (!nav) {
      return;
    }
    const {current, parent} = nav;
    if (direction === 'up') {
      // At the top of the hierarchy there is nowhere further up.
      if (parent) {
        upToParent(current);
      }
    } else if (direction === 'down') {
      downToChild(current);
    } else {
      const next = siblingStep(layout, parent ? issuesById.get(parent) : undefined, current, direction === 'right' ? 1 : -1);
      if (next) {
        goToCard(next);
        setNav({current: next, parent});
      }
    }
  }, [nav, upToParent, downToChild, layout, issuesById, goToCard]);

  const exit = useCallback(() => setNav(null), []);

  // The mode ends when the selection changes some other way, or its card leaves the board.
  useEffect(() => {
    if (nav && (selectedIds.size !== 1 || !selectedIds.has(nav.current) || !layout.placement[nav.current])) {
      setNav(null);
    }
  }, [nav, selectedIds, layout.placement]);

  const status = useMemo(() => (nav ? navStatus(layout, issuesById, nav.current, nav.parent) : null), [nav, layout, issuesById]);

  return {active: nav !== null, status, upToParent, downToChild, step, exit};
};
