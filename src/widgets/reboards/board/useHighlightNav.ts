import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import type {BoardIssue} from '../model/issue';
import type {Direction} from '../model/keyboardNav';
import type {CardRegistry} from './BoardContext';
import {orderMatches} from './useQuickFind';

type Options = {
  /** The highlighted issues on the board. */
  matchIds: Set<string>;
  issuesById: Map<string, BoardIssue>;
  registry: CardRegistry;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  /** Expands what hides an issue's card: a collapsed swimlane, column or subtask box. */
  expandFor: (issueId: string) => void;
  /** Keys start from the issue's first card after the mode moves (null: no particular card). */
  onCardPicked: (cardId: string | null) => void;
};

type HighlightNav = {
  active: boolean;
  /** Where the mode is, for the banner: "SP-12: Match 3 of 17."; null when off. */
  status: string | null;
  /** A highlight was chosen: the mode starts on its first match once the matches are known. */
  requestStart: () => void;
  /** An arrow key while the mode is on; false for the ones it leaves to the board (left and right). */
  onArrow: (direction: Direction) => boolean;
  exit: () => void;
  /** Enter or Escape: leave the mode with the current match selected; the highlight stays. */
  finish: () => void;
};

const SCROLL_DELAY = 50;

/**
 * Highlight navigation mode, entered by choosing a highlight in the magnifying glass menu: the
 * first match is selected, and Up and Down go to the previous and next match, wrapping around.
 * Enter or Escape end it with the current match selected and the highlight kept. It also ends with
 * Left or Right, when the highlight is removed, or when the selection changes some other way.
 */
export const useHighlightNav = ({matchIds, issuesById, registry, selectedIds, setSelectedIds, expandFor, onCardPicked}: Options): HighlightNav => {
  const [current, setCurrent] = useState<string | null>(null);
  const pendingStart = useRef(false);

  const goTo = useCallback((issueId: string) => {
    setSelectedIds(new Set([issueId]));
    setCurrent(issueId);
    onCardPicked(null);
    expandFor(issueId);
    // Focus first: moving focus cancels a smooth scroll in progress.
    window.setTimeout(() => {
      const element = registry.get(issueId);
      element?.focus({preventScroll: true});
      element?.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'});
    }, SCROLL_DELAY);
  }, [setSelectedIds, onCardPicked, expandFor, registry]);

  const requestStart = useCallback(() => {
    pendingStart.current = true;
  }, []);

  // A chosen highlight starts the mode once its matches are computed.
  useEffect(() => {
    if (!pendingStart.current) {
      return;
    }
    pendingStart.current = false;
    const first = orderMatches(matchIds, registry)[0];
    if (first) {
      goTo(first);
    } else {
      alertService.message('No issues match');
    }
  }, [matchIds, registry, goTo]);

  const onArrow = useCallback((direction: Direction): boolean => {
    if (direction === 'left' || direction === 'right') {
      return false;
    }
    const ordered = orderMatches(matchIds, registry);
    const at = current ? ordered.indexOf(current) : -1;
    if (ordered.length > 0) {
      const step = direction === 'down' ? 1 : -1;
      goTo(at === -1 ? ordered[0] : ordered[(at + step + ordered.length) % ordered.length]);
    }
    return true;
  }, [matchIds, registry, current, goTo]);

  const exit = useCallback(() => setCurrent(null), []);

  // The mode ends when the highlight is removed, the match no longer matches, or the selection changes some other way.
  useEffect(() => {
    if (current && (!matchIds.has(current) || selectedIds.size !== 1 || !selectedIds.has(current))) {
      setCurrent(null);
    }
  }, [current, matchIds, selectedIds]);

  const status = useMemo(() => {
    if (!current || !matchIds.has(current)) {
      return null;
    }
    const position = orderMatches(matchIds, registry).indexOf(current) + 1;
    return `${issuesById.get(current)?.idReadable ?? current}: Match ${position} of ${matchIds.size}.`;
  }, [current, matchIds, registry, issuesById]);

  return {active: current !== null, status, requestStart, onArrow, exit, finish: exit};
};
