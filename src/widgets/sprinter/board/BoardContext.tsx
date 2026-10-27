import {createContext, useContext} from 'react';
import type {CardSize} from '@/common/storage/prefs';
import type {BoardIssue} from '../model/issue';

export type CardRegistry = {
  register: (issueId: string, element: HTMLElement | null) => void;
  get: (issueId: string) => HTMLElement | undefined;
};

/** Cells to highlight while dragging: one cell for an issue, a whole swimlane (columnId null) for a group. */
export type DragHighlight = {
  rowKey: string;
  columnId: string | null;
};

export const isHighlightedCell = (highlight: DragHighlight | null, rowKey: string, columnId: string): boolean =>
  highlight !== null && highlight.rowKey === rowKey && (highlight.columnId === null || highlight.columnId === columnId);

/** Card or group box under the pointer while Ctrl- or Ctrl+Shift-dragging. */
export type LinkHighlight = {kind: 'card' | 'group'; id: string};

export type BoardContextValue = {
  dragHighlight: DragHighlight | null;
  linkHighlight: LinkHighlight | null;
  issuesById: Map<string, BoardIssue>;
  cardSize: CardSize;
  cardFields: string[];
  cardColorField: string | null;
  /** Column and swimlane fields of state type; a resolved value strikes through the card's issue ID. */
  stateFieldNames: string[];
  collapsedColumns: Set<string>;
  selectedIds: Set<string>;
  matchIds: Set<string>;
  searchTerm: string;
  onSelect: (issueId: string, additive: boolean) => void;
  onOpen: (issueId: string) => void;
  /** New-issue page for a cell; with a parent ID the new issue becomes its subtask. */
  newIssueHref: (rowKey: string, columnId: string, parentIdReadable?: string) => string | null;
  registry: CardRegistry;
  columnLabel: (columnId: string) => string;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export const useBoardContext = (): BoardContextValue => {
  const value = useContext(BoardContext);
  if (!value) {
    throw new Error('BoardContext is missing');
  }
  return value;
};

export const cellDroppableId = (rowKey: string, columnId: string, groupKey?: string): string =>
  groupKey ? `${rowKey}::${columnId}::${groupKey}` : `${rowKey}::${columnId}`;
