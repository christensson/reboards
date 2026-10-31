import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import type {BoardLayout} from '../model/layout';
import {type LaneStop, laneCardIds, laneStatus, stopIndexOfRow, swimlaneStops, topLeftCard} from '../model/swimlaneNav';

type Options = {
  layout: BoardLayout;
  collapsedRows: Set<string>;
  collapsedOuterRows: Set<string>;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** The swimlane row of a selected issue, from the card the user picked when it has several. */
  selectedRowOf: (issueId: string) => string | undefined;
  /** The card the mode selected, so that later moves start from it rather than the issue's first card. */
  onCardPicked: (cardId: string | null) => void;
};

type SwimlaneNav = {
  active: boolean;
  /** Where the mode is, for the banner: "Major / Anna: swimlane 3 of 12, 7 issues."; null when off. */
  status: string | null;
  /** S (1) and Shift+S (-1): start the mode on the next or previous swimlane, or step within it. */
  start: (step: 1 | -1) => void;
  /** An arrow key while the mode is on; false for the ones it leaves to the board (left and right). */
  onArrow: (direction: 'up' | 'down' | 'left' | 'right') => boolean;
  exit: () => void;
  /** A click on the board outside the cards: it ends the mode, and S then starts from the swimlane clicked. */
  onBoardClick: (target: EventTarget) => void;
};

/**
 * The element of a stop. Compared by dataset rather than by selector: the row keys of two-level
 * boards hold a NUL separator, which CSS.escape turns into U+FFFD, so no selector would match.
 */
const elementOf = (content: Element, stop: LaneStop): HTMLElement | null => {
  const outer = stop.kind === 'outer';
  const elements = Array.from(content.querySelectorAll<HTMLElement>(outer ? '[data-outer-key]' : '[data-row-key]'));
  return elements.find(element => (outer ? element.dataset.outerKey : element.dataset.rowKey) === stop.key) ?? null;
};

const SCROLL_DELAY = 50;

/** The rendered cards by card id. Read from the dataset: card ids hold row keys, which may hold a NUL. */
const cardElementsById = (content: Element): Map<string, HTMLElement> =>
  new Map(Array.from(content.querySelectorAll<HTMLElement>('[data-card-id]')).map(element => [element.dataset.cardId ?? '', element]));

const headerHeight = (scroller: HTMLElement): number => scroller.querySelector<HTMLElement>('.board-header')?.offsetHeight ?? 0;

/** The stop of a clicked element: the swimlane row it is in, or the collapsed first-level swimlane; -1 for none. */
const stopIndexOfElement = (target: EventTarget, stops: LaneStop[]): number => {
  const lane = target instanceof Element ? target.closest<HTMLElement>('[data-row-key], [data-outer-key]') : null;
  if (lane?.dataset.rowKey !== undefined) {
    return stopIndexOfRow(stops, lane.dataset.rowKey);
  }
  return lane?.dataset.outerKey === undefined ? -1 : stops.findIndex(stop => stop.key === lane.dataset.outerKey);
};

/** Whether an element is at least partly in view of the scroll container. */
const isInView = (scroller: HTMLElement, element: HTMLElement): boolean => {
  const view = scroller.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return box.bottom > view.top && box.top < view.bottom;
};

/** The swimlane at the top of the view: the first whose bottom is below the column header. */
const topStopIndex = (scroller: HTMLElement, stops: LaneStop[]): number => {
  const top = scroller.getBoundingClientRect().top + headerHeight(scroller);
  const index = stops.findIndex(stop => {
    const element = elementOf(scroller, stop);
    return element ? element.getBoundingClientRect().bottom > top + 1 : false;
  });
  return Math.max(0, index);
};

/** Where S starts without a selection: the swimlane clicked last while it is still in view, else the top one. */
const clickedOrTopIndex = (scroller: HTMLElement, stops: LaneStop[], clickedKey: string | null): number => {
  const clicked = clickedKey ? stops.findIndex(stop => stop.key === clickedKey) : -1;
  const element = clicked === -1 ? null : elementOf(scroller, stops[clicked]);
  return element && isInView(scroller, element) ? clicked : topStopIndex(scroller, stops);
};

/**
 * Swimlane navigation mode, entered with S or Shift+S: Up and Down (and S, Shift+S) go to the
 * swimlane above or below, scrolled so its header sits under the column header, and select the
 * card nearest its header (the leftmost of those). It ends with Escape, Left or Right, or when the selection changes some other way.
 */
export const useSwimlaneNav = ({layout, collapsedRows, collapsedOuterRows, selectedIds, setSelectedIds, scrollRef, selectedRowOf, onCardPicked}: Options): SwimlaneNav => {
  const stops = useMemo(() => swimlaneStops(layout, collapsedOuterRows), [layout, collapsedOuterRows]);
  // The swimlane the mode is at, and the card it selected there (null: none).
  const [nav, setNav] = useState<{key: string; selected: string | null} | null>(null);
  const index = nav ? stops.findIndex(stop => stop.key === nav.key) : -1;
  // The swimlane last clicked outside the cards: with nothing selected, S starts from it while it is in view.
  const clickedKey = useRef<string | null>(null);

  const goTo = useCallback((target: number) => {
    const stop = stops[target];
    const scroller = scrollRef.current;
    if (!stop || !scroller) {
      return;
    }
    // The card nearest the swimlane header, then the leftmost, as laid out on screen.
    const cardElements = cardElementsById(scroller);
    const card = topLeftCard(laneCardIds(layout, stop, collapsedRows).flatMap(id => {
      const box = cardElements.get(id)?.getBoundingClientRect();
      return box ? [{id, top: box.top, left: box.left}] : [];
    }));
    const issueId = card ? layout.cards[card].issueId : null;
    setSelectedIds(new Set(issueId ? [issueId] : []));
    setNav({key: stop.key, selected: issueId});
    onCardPicked(card);
    // After the selection has rendered: focus first, since moving focus cancels a smooth scroll in
    // progress, then scroll the header to just under the column header (rows keep clear of it with
    // scroll-margin-top). The same order and delay as P and Shift+P.
    window.setTimeout(() => {
      if (card) {
        cardElements.get(card)?.focus({preventScroll: true});
      }
      elementOf(scroller, stop)?.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'smooth'});
    }, SCROLL_DELAY);
  }, [stops, scrollRef, layout, collapsedRows, setSelectedIds, onCardPicked]);

  const start = useCallback((step: 1 | -1) => {
    if (stops.length === 0) {
      alertService.message('This board has no swimlanes');
      return;
    }
    if (index !== -1) {
      // In the mode, S and Shift+S are Down and Up.
      const next = index + step;
      if (next >= 0 && next < stops.length) {
        goTo(next);
      }
      return;
    }
    const selected = Array.from(selectedIds).pop();
    const rowKey = selected ? selectedRowOf(selected) : undefined;
    const fromSelection = rowKey ? stopIndexOfRow(stops, rowKey) : -1;
    const scroller = scrollRef.current;
    const current = fromSelection !== -1 || !scroller ? Math.max(0, fromSelection) : clickedOrTopIndex(scroller, stops, clickedKey.current);
    // At the first or last swimlane the mode still starts, on the current one.
    goTo(Math.min(stops.length - 1, Math.max(0, current + step)));
  }, [stops, index, goTo, selectedIds, selectedRowOf, scrollRef]);

  const onArrow = useCallback((direction: 'up' | 'down' | 'left' | 'right'): boolean => {
    if (direction === 'left' || direction === 'right') {
      return false;
    }
    const next = index + (direction === 'down' ? 1 : -1);
    // At the first and last swimlane there is nowhere further.
    if (index !== -1 && next >= 0 && next < stops.length) {
      goTo(next);
    }
    return true;
  }, [index, stops.length, goTo]);

  const exit = useCallback(() => setNav(null), []);

  const onBoardClick = useCallback((target: EventTarget) => {
    const clicked = stops[stopIndexOfElement(target, stops)];
    clickedKey.current = clicked?.key ?? null;
    setNav(null);
  }, [stops]);

  // The mode ends when its swimlane is gone, or the selection changes some other way.
  useEffect(() => {
    if (!nav) {
      return;
    }
    const selectionKept = nav.selected ? selectedIds.size === 1 && selectedIds.has(nav.selected) : selectedIds.size === 0;
    if (index === -1 || !selectionKept) {
      setNav(null);
    }
  }, [nav, index, selectedIds]);

  const status = nav && index !== -1 ? laneStatus(stops, index) : null;
  return {active: nav !== null, status, start, onArrow, exit, onBoardClick};
};
