import {ALL_PAGE, type BoardConfig, NO_VALUE_PAGE} from '@/common/model/board-config';
import type {FieldUniverse} from './fieldUniverse';

/** A page of the page selector. */
export type BoardPage = {
  key: string;
  label: string;
  /** "All": always first, cannot be starred. */
  pinned?: boolean;
  /** What the closed selector shows; field pages name the field: "Priority: Major". */
  selectedLabel?: string;
};

/**
 * The pages a board offers: query pages in their order, or "All", the shown values of the page field
 * (every value but archived versions unless restricted) and "No <field>" when the field can be empty.
 * Null for boards without pages.
 */
export const boardPages = (board: BoardConfig, universe: FieldUniverse): BoardPage[] | null => {
  const {mode, field, values, pages} = board.pages;
  if (mode === 'queries') {
    return pages.map(page => ({key: page.id, label: page.name}));
  }
  if (mode !== 'field' || !field) {
    return null;
  }
  const resolved = universe.byName.get(field.name);
  const page = (key: string, label: string, selected = label): BoardPage => ({key, label, selectedLabel: `${field.name}: ${selected}`});
  const all = {...page(ALL_PAGE, 'All'), pinned: true};
  const noValue = page(NO_VALUE_PAGE, `No ${field.name}`, 'None');
  const valuePages = (resolved?.values ?? []).map(v => page(v.key, v.label));
  if (values.length > 0) {
    // A value the projects do not have (any more) still shows by its key.
    return [all, ...values.map(key => (key === NO_VALUE_PAGE ? noValue : valuePages.find(p => p.key === key) ?? page(key, key)))];
  }
  const shown = (resolved?.values ?? []).filter(v => !v.archived).map(v => page(v.key, v.label));
  return [all, ...shown, ...(resolved?.canBeEmpty === false ? [] : [noValue])];
};

/** The page shown when none is asked for: "All" for field pages, else the first starred page, else the first page. */
export const defaultPage = (pages: BoardPage[], starred: string[]): string | null =>
  (pages.find(p => p.pinned) ?? pages.find(p => starred.includes(p.key)) ?? pages[0])?.key ?? null;

/** The page to show for a requested key (null: none asked for): that page when the board has it, else the default. */
export const resolvePage = (pages: BoardPage[] | null, requested: string | null, starred: string[]): string | null => {
  if (!pages) {
    return null;
  }
  return pages.some(p => p.key === requested) ? requested : defaultPage(pages, starred);
};

/** The `page` URL parameter of a page: none for "All". */
export const pageParam = (key: string | null): string | null => (key === ALL_PAGE ? null : key);

export type OrderedPages = {
  pinned: BoardPage[];
  starred: BoardPage[];
  others: BoardPage[];
};

/** Splits pages into "All", the starred pages and the others, each in the configured order. */
export const orderPages = (pages: BoardPage[], starredKeys: string[]): OrderedPages => {
  const starred = new Set(starredKeys);
  return {
    pinned: pages.filter(p => p.pinned),
    starred: pages.filter(p => !p.pinned && starred.has(p.key)),
    others: pages.filter(p => !p.pinned && !starred.has(p.key))
  };
};
