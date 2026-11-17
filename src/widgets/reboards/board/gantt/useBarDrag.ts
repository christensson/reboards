import {useCallback, useEffect, useRef} from 'react';
import type {DragTarget} from '../../model/ganttEdit';
import type {Span} from '../../model/gantt';

/** Movement before a press on a bar becomes a drag, so a click still selects. */
const DRAG_THRESHOLD = 3;
/** Near this many pixels from the chart's left or right edge, dragging scrolls the chart. */
const EDGE_ZONE = 40;
/** Fastest auto-scroll, in pixels per frame. */
const MAX_SCROLL_STEP = 16;

export type DragPoint = {x: number; y: number};

/** How far to scroll this frame: faster the closer the pointer is to (or the further past) an edge of the chart. */
const edgeStep = (x: number, left: number, right: number): number => {
  if (x < left + EDGE_ZONE) {
    return -MAX_SCROLL_STEP * Math.min(1, (left + EDGE_ZONE - x) / EDGE_ZONE);
  }
  if (x > right - EDGE_ZONE) {
    return MAX_SCROLL_STEP * Math.min(1, (x - right + EDGE_ZONE) / EDGE_ZONE);
  }
  return 0;
};

type Options = {
  container: HTMLDivElement | null;
  listWidth: number;
  pxPerDay: number;
  /** The live preview after moving by whole days: where the bar would go, and the sprints it would get. */
  onPreview: (target: DragTarget, before: Span, deltaDays: number, at: DragPoint) => void;
  /** The drag ended with a drop; the preview holds where. */
  onDrop: (at: DragPoint) => void;
  onCancel: () => void;
};

type Active = {target: DragTarget; before: Span; startX: number; startScroll: number; x: number; y: number; dragging: boolean};

/**
 * Dragging the bars of the Gantt chart: a press on a handle, a bar or a diamond becomes a drag
 * after a few pixels. The preview follows in whole days, also while the chart scrolls by itself
 * near its edges. Escape cancels.
 */
export const useBarDrag = ({container, listWidth, pxPerDay, onPreview, onDrop, onCancel}: Options) => {
  const active = useRef<Active | null>(null);
  const latest = useRef({container, listWidth, pxPerDay, onPreview, onDrop, onCancel});
  latest.current = {container, listWidth, pxPerDay, onPreview, onDrop, onCancel};
  const frame = useRef(0);

  const preview = useCallback(() => {
    const drag = active.current;
    const {container: element, pxPerDay: px, onPreview: show} = latest.current;
    if (!drag || !element) {
      return;
    }
    const dx = drag.x - drag.startX + element.scrollLeft - drag.startScroll;
    show(drag.target, drag.before, Math.round(dx / px), {x: drag.x, y: drag.y});
  }, []);

  const autoScroll = useCallback(() => {
    const drag = active.current;
    const element = latest.current.container;
    if (!drag?.dragging || !element) {
      return;
    }
    const box = element.getBoundingClientRect();
    const step = edgeStep(drag.x, box.left + latest.current.listWidth, box.right);
    if (step !== 0) {
      element.scrollLeft += step;
      preview();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }, [preview]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    active.current = null;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = active.current;
      if (!drag) {
        return;
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.dragging && Math.abs(drag.x - drag.startX) < DRAG_THRESHOLD) {
        return;
      }
      if (!drag.dragging) {
        drag.dragging = true;
        frame.current = requestAnimationFrame(autoScroll);
      }
      preview();
    };
    const onUp = () => {
      const drag = active.current;
      stop();
      if (drag?.dragging) {
        latest.current.onDrop({x: drag.x, y: drag.y});
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && active.current?.dragging) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stop();
        latest.current.onCancel();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // Capture: Escape ends the drag before the chart's own keys see it.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
      stop();
    };
  }, [autoScroll, preview, stop]);

  /** A press on something draggable: a drag of `target` from `before` may start. */
  const grab = useCallback((event: React.PointerEvent, target: DragTarget, before: Span) => {
    if (event.button !== 0 || !latest.current.container) {
      return;
    }
    // Keep text from being selected while dragging.
    event.preventDefault();
    active.current = {target, before, startX: event.clientX, startScroll: latest.current.container.scrollLeft, x: event.clientX, y: event.clientY, dragging: false};
  }, []);

  return {grab};
};
