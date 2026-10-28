import type {BoardIssue} from './issue';

/** Lower-cased words of a search term; every word must match somewhere. */
export const searchWords = (term: string): string[] =>
  term.trim().toLowerCase().split(/\s+/u).filter(Boolean);

/** True when every word is a case-insensitive substring of the readable id or the summary. */
export const matchesSearch = (issue: BoardIssue, words: string[]): boolean => {
  if (words.length === 0) {
    return false;
  }
  const id = issue.idReadable.toLowerCase();
  const summary = issue.summary.toLowerCase();
  return words.every(word => id.includes(word) || summary.includes(word));
};

export const findMatches = (issues: BoardIssue[], term: string): string[] => {
  const words = searchWords(term);
  return words.length > 0 ? issues.filter(i => matchesSearch(i, words)).map(i => i.id) : [];
};

/**
 * Ids matching the text term and, when set, the quick filter (card field that must be unset).
 * Both conditions must hold when both are given; nothing matches when neither is given.
 */
export const computeMatchIds = (issues: BoardIssue[], term: string, unsetField: string | null): Set<string> => {
  const words = searchWords(term);
  if (words.length === 0 && !unsetField) {
    return new Set();
  }
  return new Set(
    issues
      .filter(issue => words.length === 0 || matchesSearch(issue, words))
      .filter(issue => !unsetField || !issue.fields[unsetField])
      .map(issue => issue.id)
  );
};

export type TextSegment = {
  text: string;
  match: boolean;
};

type Range = {start: number; end: number};

const occurrences = (lower: string, word: string): Range[] => {
  const ranges: Range[] = [];
  let cursor = 0;
  for (;;) {
    const index = lower.indexOf(word, cursor);
    if (index === -1) {
      return ranges;
    }
    ranges.push({start: index, end: index + word.length});
    cursor = index + word.length;
  }
};

const mergeRanges = (ranges: Range[]): Range[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  sorted.forEach(range => {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({...range});
    }
  });
  return merged;
};

/** Splits text into matching / non-matching segments for every occurrence of any word. */
export const splitForHighlight = (text: string, words: string[]): TextSegment[] => {
  if (words.length === 0) {
    return [{text, match: false}];
  }
  const lower = text.toLowerCase();
  const ranges = mergeRanges(words.flatMap(word => occurrences(lower, word)));
  const segments: TextSegment[] = [];
  let cursor = 0;
  ranges.forEach(range => {
    if (range.start > cursor) {
      segments.push({text: text.slice(cursor, range.start), match: false});
    }
    segments.push({text: text.slice(range.start, range.end), match: true});
    cursor = range.end;
  });
  if (cursor < text.length) {
    segments.push({text: text.slice(cursor), match: false});
  }
  return segments;
};
