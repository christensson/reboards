import {useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import {type GanttScale, clampPxPerDay, dayX, fitPxPerDay, xDay} from '../../model/ganttScale';
import {MS_PER_DAY} from '../../model/workTime';

type Options = {
  /** The chart's scroll container; null until the chart is drawn (it is not while issues load). */
  element: HTMLDivElement | null;
  scale: GanttScale;
  /** Width of the issue list left of the chart. */
  listWidth: number;
  today: number;
  /** The drawn spans without padding, for "Fit". */
  span: {start: number; end: number};
  pxPerDay: number;
  onPxPerDay: (pxPerDay: number) => void;
  todaySignal: number;
  fitSignal: number;
};

/** Where today sits in the visible chart after scrolling to it, as a fraction of its width. */
const TODAY_AT = 0.3;
/** How fast the wheel zooms: a mouse wheel notch (about 100 pixels) zooms by about a fifth. */
const WHEEL_RATE = 0.002;
/** Wheel deltas in lines (Firefox) as pixels. */
const LINE_HEIGHT = 16;
/** Pixels "Fit" leaves free, so the fitted chart never needs a horizontal scrollbar. */
const FIT_SLACK = 4;
/** The + and − keys zoom by this factor. */
export const KEY_ZOOM = 1.25;

/**
 * Zooming the Gantt chart: Ctrl (or Cmd) with the wheel, which is also a trackpad pinch, zooms
 * around the pointer; other zooms (presets, keys) keep the day in the middle of the chart in
 * place. "Fit" shows every issue, and the chart opens with today in view.
 */
export const useGanttZoom = ({element, scale, listWidth, today, span, pxPerDay, onPxPerDay, todaySignal, fitSignal}: Options) => {
  const previous = useRef<GanttScale | null>(null);
  /** The x in the viewport that the next zoom keeps in place; null for the middle of the chart. */
  const anchor = useRef<number | null>(null);
  const pending = useRef<'fit' | null>(null);
  const latest = useRef({pxPerDay, listWidth, onPxPerDay});
  latest.current = {pxPerDay, listWidth, onPxPerDay};

  const chartWidth = useCallback((container: HTMLElement) => container.clientWidth - listWidth, [listWidth]);
  const scrollToToday = useCallback((container: HTMLElement, at: GanttScale) => {
    container.scrollLeft = Math.max(0, dayX(at, today) - chartWidth(container) * TODAY_AT);
  }, [today, chartWidth]);

  // After the scale changes: keep the anchored day in place, or show what was asked for.
  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const before = previous.current;
    const mode = pending.current;
    const at = anchor.current;
    previous.current = scale;
    pending.current = null;
    anchor.current = null;
    if (!before) {
      scrollToToday(element, scale);
    } else if (mode === 'fit') {
      element.scrollLeft = 0;
    } else if (before.start !== scale.start || before.pxPerDay !== scale.pxPerDay) {
      const offset = at ?? listWidth + chartWidth(element) / 2;
      const day = xDay(before, element.scrollLeft + offset - listWidth);
      element.scrollLeft = listWidth + dayX(scale, day) - offset;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the scale changes or the chart appears
  }, [scale, element]);

  const zoomBy = useCallback((factor: number, at: number | null = null) => {
    const current = latest.current.pxPerDay;
    const next = clampPxPerDay(current * factor);
    if (next === current) {
      return;
    }
    anchor.current = at;
    latest.current.pxPerDay = next;
    latest.current.onPxPerDay(next);
  }, []);

  useEffect(() => {
    if (!element) {
      return undefined;
    }
    // Not passive: Ctrl+wheel would otherwise zoom the whole page.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * LINE_HEIGHT : event.deltaY;
      const x = event.clientX - element.getBoundingClientRect().left;
      zoomBy(Math.exp(-delta * WHEEL_RATE), x > latest.current.listWidth ? x : null);
    };
    element.addEventListener('wheel', onWheel, {passive: false});
    return () => element.removeEventListener('wheel', onWheel);
  }, [element, zoomBy]);

  useEffect(() => {
    if (todaySignal > 0 && element && previous.current) {
      scrollToToday(element, previous.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [todaySignal]);

  useEffect(() => {
    if (fitSignal === 0 || !element) {
      return;
    }
    // A few pixels to spare: the scale's rounded width and borders must not tip it into scrolling.
    const next = fitPxPerDay((span.end - span.start) / MS_PER_DAY + 1, chartWidth(element) - FIT_SLACK);
    if (next === latest.current.pxPerDay) {
      element.scrollLeft = 0;
      return;
    }
    pending.current = 'fit';
    latest.current.onPxPerDay(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [fitSignal]);

  return {zoomBy};
};
