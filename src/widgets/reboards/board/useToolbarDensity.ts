import {useLayoutEffect, useRef, useState} from 'react';

/**
 * How much the toolbar folds away to stay on one line:
 * - full: everything shown;
 * - compact: the find hint becomes its button, the layout and zoom buttons become dropdowns;
 * - narrow: the card size moves into the "⋯" menu, and the selectors shorten;
 * - tight: the status and Refresh move into the "⋯" menu too.
 */
export type Density = 'full' | 'compact' | 'narrow' | 'tight';

export const DENSITIES: Density[] = ['full', 'compact', 'narrow', 'tight'];

/** Overflow below this many pixels is rounding, not overflow. */
const SLACK = 1;

/**
 * The next density level: one denser while the toolbar overflows, one roomier once the width
 * fits what the roomier level needed when it was last measured, else the same.
 */
export const pickDensity = (level: number, needed: (number | undefined)[], width: number, overflowing: boolean): number => {
  if (overflowing) {
    return Math.min(DENSITIES.length - 1, level + 1);
  }
  const roomier = needed[level - 1];
  return level > 0 && roomier !== undefined && roomier <= width ? level - 1 : level;
};

/**
 * Picks the toolbar's density so it stays on one line: it folds while it overflows and unfolds
 * when the window widens again. `content` changes (another board, page or layout) measure afresh.
 */
export const useToolbarDensity = (ref: React.RefObject<HTMLElement | null>, content: string): Density => {
  const [level, setLevel] = useState(0);
  const [width, setWidth] = useState(0);
  /** The width each level needed, measured when it overflowed. */
  const needed = useRef<(number | undefined)[]>([]);
  const lastContent = useRef(content);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  // Before paint: folding further shows no overflowing frame.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (lastContent.current !== content) {
      lastContent.current = content;
      needed.current = [];
      if (level !== 0) {
        setLevel(0);
        return;
      }
    }
    const overflowing = element.scrollWidth > element.clientWidth + SLACK;
    if (overflowing) {
      needed.current[level] = element.scrollWidth;
    }
    const next = pickDensity(level, needed.current, element.clientWidth, overflowing);
    if (next !== level) {
      setLevel(next);
    }
    // The width is read from the element; its state only makes a resize run this again.
  }, [ref, content, level, width]);

  return DENSITIES[level];
};
