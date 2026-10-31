import type {BoardIssue} from './issue';
import {type BoardLayout, orderOnBoard} from './layout';

/**
 * The parent subtask navigation treats as the issue's own: `preferred` (the parent navigated
 * through) when it is one of the issue's parents on the board, else its first parent on the board.
 */
export const navParent = (issue: BoardIssue | undefined, layout: BoardLayout, preferred: string | null): string | null => {
  if (!issue) {
    return null;
  }
  if (preferred && issue.parentIds.includes(preferred) && layout.placement[preferred]) {
    return preferred;
  }
  return issue.parentIds.find(id => layout.placement[id]) ?? null;
};

/** The next (1) or previous (-1) subtask of `parent` on the board after `current`, wrapping around; null when there is no other. */
export const siblingStep = (layout: BoardLayout, parent: BoardIssue | undefined, current: string, step: 1 | -1): string | null => {
  const siblings = orderOnBoard(layout, parent?.childIds ?? []);
  const at = siblings.indexOf(current);
  if (at === -1 || siblings.length < 2) {
    return null;
  }
  return siblings[(at + step + siblings.length) % siblings.length];
};

const subtasksText = (count: number): string => `${count} ${count === 1 ? 'subtask' : 'subtasks'}`;

/**
 * Where subtask navigation is: "SP-4: Subtask 2 of 3 with parent SP-1, 5 subtasks." Positions and
 * counts are of the subtasks on the board, the ones the arrows reach; each part is left out when empty.
 */
export const navStatus = (layout: BoardLayout, issuesById: Map<string, BoardIssue>, current: string, parent: string | null): string => {
  const issue = issuesById.get(current);
  const parts: string[] = [];
  const parentIssue = parent ? issuesById.get(parent) : undefined;
  if (parentIssue) {
    const siblings = orderOnBoard(layout, parentIssue.childIds);
    parts.push(`Subtask ${siblings.indexOf(current) + 1} of ${siblings.length} with parent ${parentIssue.idReadable}`);
  }
  const subtasks = orderOnBoard(layout, issue?.childIds ?? []).length;
  if (subtasks > 0) {
    parts.push(subtasksText(subtasks));
  }
  const id = issue?.idReadable ?? current;
  return parts.length > 0 ? `${id}: ${parts.join(', ')}.` : `${id}.`;
};
