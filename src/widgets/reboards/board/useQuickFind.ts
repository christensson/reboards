import {useEffect} from 'react';
import type {CardRegistry} from './BoardContext';

const isTypingTarget = (element: Element | null): boolean =>
  element instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable);

const isDialogOpen = (): boolean => document.querySelector('[data-test~="ring-dialog"]') !== null;

/** The rendered match closest to the top (then left) of the board. */
const topMatch = (matchIds: Set<string>, registry: CardRegistry): HTMLElement | null => {
  let best: {element: HTMLElement; top: number; left: number} | null = null;
  matchIds.forEach(id => {
    const element = registry.get(id);
    if (!element) {
      return;
    }
    const {top, left} = element.getBoundingClientRect();
    if (!best || top < best.top || (top === best.top && left < best.left)) {
      best = {element, top, left};
    }
  });
  return (best as {element: HTMLElement} | null)?.element ?? null;
};

/**
 * Interactive find: "/" opens a box (term !== null); while typing, the topmost match is scrolled into view.
 * `blocked` suppresses "/" while dialogs of the board are open.
 */
export const useQuickFind = (
  term: string | null,
  setTerm: (term: string | null) => void,
  matchIds: Set<string>,
  registry: CardRegistry,
  blocked: boolean
): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || term !== null || blocked) {
        return;
      }
      if (isTypingTarget(document.activeElement) || isDialogOpen()) {
        return;
      }
      event.preventDefault();
      setTerm('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [term, setTerm, blocked]);

  useEffect(() => {
    if (term === null || !term.trim()) {
      return;
    }
    topMatch(matchIds, registry)?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});
  }, [term, matchIds, registry]);
};
