import {useEffect, useRef, useState} from 'react';
import type {BoardLayout} from '../model/layout';
import {type Collapsed, type Direction, directionOf, nearestInDirection, stepTarget} from '../model/keyboardNav';
import type {MoveTarget} from '../model/mutations';
import type {CardRegistry} from './BoardContext';
import {isDialogOpen, isTypingTarget} from './useQuickFind';

/** A card being moved with Ctrl+arrows: a shadow of it shows where it would go. */
export type KeyMove = {issueId: string; from: MoveTarget; to: MoveTarget};

type Options = {
  /** False while the find box or a dialog of the board is open. */
  enabled: boolean;
  layout: BoardLayout;
  registry: CardRegistry;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  collapsed: Collapsed;
  canMove: (issueId: string) => boolean;
  onOpen: (issueId: string) => void;
  onParent: (issueId: string) => void;
  /** Shift+P: back to the subtask "P" came from, when the parent is still the selected issue. */
  onBackToChild: (issueId: string) => void;
  onToggleConnectors: () => void;
  onHelp: () => void;
  onCommitMove: (move: KeyMove) => void;
};

const isPressable = (element: Element | null): boolean => element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement;

const boxOf = (element: HTMLElement) => {
  const {left, top, width, height} = element.getBoundingClientRect();
  return {left, top, width, height};
};

/**
 * Scrolls a card into view and gives it keyboard focus. Focus moves along with the selection,
 * so the focus ring does not stay on the card the user left and look like a second selection.
 */
const scrollToCard = (registry: CardRegistry, issueId: string): void => {
  const element = registry.get(issueId);
  element?.focus({preventScroll: true});
  element?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
};

/** The card an arrow goes to: the nearest one that way, or the top left one when nothing is selected. */
const nextCard = (registry: CardRegistry, anchor: string | null, direction: Direction): string | null => {
  const candidates = registry.ids().flatMap(id => {
    const element = registry.get(id);
    return element && id !== anchor ? [{id, box: boxOf(element)}] : [];
  });
  const from = anchor ? registry.get(anchor) : undefined;
  if (!from) {
    const first = [...candidates].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left)[0];
    return first?.id ?? null;
  }
  return nearestInDirection(boxOf(from), candidates, direction);
};

/**
 * Keyboard use of the board:
 * - arrows move the selection to the nearest card that way, scrolling it into view;
 * - Ctrl+arrows move a shadow of the selected card to the next column or row; Enter applies
 *   the move, Escape cancels it;
 * - Enter opens the selected issue, P selects its parent and Shift+P goes back to the subtask,
 *   R shows or hides relations, ? lists the keys;
 * - Escape clears the selection.
 */
export const useBoardKeys = (options: Options): {keyMove: KeyMove | null} => {
  const [keyMove, setKeyMove] = useState<KeyMove | null>(null);
  const anchorRef = useRef<string | null>(null);
  const {selectedIds} = options;
  // The card the keys act on: the one selected last, else any selected one.
  if (!anchorRef.current || !selectedIds.has(anchorRef.current)) {
    anchorRef.current = selectedIds.size > 0 ? Array.from(selectedIds)[selectedIds.size - 1] : null;
  }
  const latest = useRef(options);
  latest.current = options;
  const moveRef = useRef(keyMove);
  moveRef.current = keyMove;

  useEffect(() => {
    const select = (id: string) => {
      anchorRef.current = id;
      latest.current.setSelectedIds(new Set([id]));
      scrollToCard(latest.current.registry, id);
    };
    const onMoveKey = (event: KeyboardEvent, move: KeyMove): boolean => {
      const direction = directionOf(event.key);
      if (direction) {
        const to = stepTarget(latest.current.layout, move.to, direction, latest.current.collapsed);
        if (to.rowKey === move.from.rowKey && to.columnId === move.from.columnId) {
          // Back where it started: nothing to apply, so the move ends.
          setKeyMove(null);
          scrollToCard(latest.current.registry, move.issueId);
        } else {
          setKeyMove({...move, to});
        }
      } else if (event.key === 'Enter') {
        setKeyMove(null);
        latest.current.onCommitMove(move);
      } else if (event.key === 'Escape') {
        setKeyMove(null);
      } else {
        return false;
      }
      return true;
    };
    const onArrow = (event: KeyboardEvent, direction: Direction): void => {
      const {layout, collapsed, canMove, registry} = latest.current;
      const anchor = anchorRef.current;
      if (event.ctrlKey || event.metaKey) {
        const from = anchor ? layout.placement[anchor] : undefined;
        if (anchor && from && canMove(anchor)) {
          const start = {rowKey: from.rowKey, columnId: from.columnId};
          const to = stepTarget(layout, start, direction, collapsed);
          // At the edge of the board there is nowhere to go.
          if (to.rowKey !== start.rowKey || to.columnId !== start.columnId) {
            setKeyMove({issueId: anchor, from: start, to});
          }
        }
        return;
      }
      const next = nextCard(registry, anchor, direction);
      if (next) {
        select(next);
      }
    };
    const onKey = (event: KeyboardEvent): boolean => {
      const {onOpen, onParent, onBackToChild, onToggleConnectors, onHelp, setSelectedIds} = latest.current;
      const anchor = anchorRef.current;
      const direction = directionOf(event.key);
      if (direction) {
        onArrow(event, direction);
        return true;
      }
      // With Ctrl or Cmd the key belongs to the browser (Ctrl+R reloads, Ctrl+P prints).
      if (event.ctrlKey || event.metaKey) {
        return false;
      }
      if (event.key === 'Escape') {
        setSelectedIds(new Set());
      } else if (event.key === 'Enter' && anchor) {
        onOpen(anchor);
      } else if (event.key === 'p' && anchor) {
        onParent(anchor);
      } else if (event.key === 'P' && anchor) {
        onBackToChild(anchor);
      } else if (event.key === 'r') {
        // Plain R only: Shift+R and Ctrl+R are left to the browser.
        onToggleConnectors();
      } else if (event.key === '?') {
        onHelp();
      } else {
        return false;
      }
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!latest.current.enabled || event.altKey || isTypingTarget(document.activeElement) || isDialogOpen()) {
        return;
      }
      // Enter on a focused button or link presses it.
      if (event.key === 'Enter' && isPressable(document.activeElement)) {
        return;
      }
      const handled = moveRef.current ? onMoveKey(event, moveRef.current) : onKey(event);
      if (handled) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A move whose card is gone (filtered out, reloaded away) ends.
  useEffect(() => {
    if (keyMove && !options.layout.placement[keyMove.issueId]) {
      setKeyMove(null);
    }
  }, [keyMove, options.layout.placement]);

  return {keyMove};
};
