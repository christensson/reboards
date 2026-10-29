import {type BoardConfig, columnLabel} from './board-config';

/**
 * Three-way merge of board settings, used when someone else saved a board
 * while it was being edited. Settings are merged in groups; keys that only make
 * sense together (a column field and its columns, the two swimlane levels) form
 * one group so a merge never mixes them.
 */
export const MERGE_GROUPS = {
  name: {label: 'Name', keys: ['name']},
  shared: {label: 'Sharing', keys: ['shared']},
  projects: {label: 'Projects', keys: ['projects']},
  query: {label: 'Query', keys: ['query']},
  sprints: {label: 'Sprints', keys: ['sprints']},
  columns: {label: 'Columns', keys: ['columnField', 'columns', 'columnOptions', 'ignoredValues']},
  swimlanes: {label: 'Swimlanes', keys: ['row', 'innerRow']},
  cardFields: {label: 'Card fields', keys: ['cardFields']},
  cardColorField: {label: 'Card color', keys: ['cardColorField']},
  linkTypes: {label: 'Connectors', keys: ['linkTypes']},
  related: {label: 'Related boards', keys: ['relatedBoards']},
  timeline: {label: 'Time layout', keys: ['timeline', 'defaultRowMode']}
} as const satisfies Record<string, {label: string; keys: readonly (keyof BoardConfig)[]}>;

export type MergeGroup = keyof typeof MERGE_GROUPS;

export const mergeGroups = Object.keys(MERGE_GROUPS) as MergeGroup[];

export type MergeResult = {
  /** Mine, plus their changes where only they changed something; conflicting groups keep mine until resolved. */
  merged: BoardConfig;
  /** Groups only they changed; their values are in `merged`. */
  theirsApplied: MergeGroup[];
  /** Groups both changed, to different values. */
  conflicts: MergeGroup[];
};

const valueOf = (board: BoardConfig, group: MergeGroup): string =>
  JSON.stringify(MERGE_GROUPS[group].keys.map(key => board[key]));

const copyGroup = (target: BoardConfig, source: BoardConfig, group: MergeGroup): BoardConfig => {
  const next = {...target};
  MERGE_GROUPS[group].keys.forEach(key => {
    (next as Record<string, unknown>)[key] = source[key];
  });
  return next;
};

/** Server-owned fields always come from the stored board, so the next save names its version. */
const withServerFields = (mine: BoardConfig, theirs: BoardConfig): BoardConfig => ({
  ...mine,
  id: theirs.id,
  owner: theirs.owner,
  ownerId: theirs.ownerId,
  createdAt: theirs.createdAt,
  updatedAt: theirs.updatedAt,
  version: theirs.version
});

export const mergeBoards = (base: BoardConfig, mine: BoardConfig, theirs: BoardConfig): MergeResult => {
  let merged = withServerFields(mine, theirs);
  const theirsApplied: MergeGroup[] = [];
  const conflicts: MergeGroup[] = [];
  mergeGroups.forEach(group => {
    const [b, m, t] = [valueOf(base, group), valueOf(mine, group), valueOf(theirs, group)];
    if (m === t || t === b) {
      return;
    }
    if (m === b) {
      merged = copyGroup(merged, theirs, group);
      theirsApplied.push(group);
    } else {
      conflicts.push(group);
    }
  });
  return {merged, theirsApplied, conflicts};
};

export type MergeChoice = 'mine' | 'theirs';

/** Applies the user's choice for each conflicting group; unlisted groups keep mine. */
export const resolveMerge = (result: MergeResult, theirs: BoardConfig, choices: Partial<Record<MergeGroup, MergeChoice>>): BoardConfig =>
  result.conflicts.reduce((board, group) => (choices[group] === 'theirs' ? copyGroup(board, theirs, group) : board), result.merged);

const SUMMARY_LENGTH = 120;

const list = (items: string[]): string => items.join(', ') || 'None';

const summaries: Record<MergeGroup, (board: BoardConfig) => string> = {
  name: board => board.name,
  shared: board => (board.shared ? 'Shared' : 'Personal'),
  projects: board => list(board.projects.map(p => p.shortName)),
  query: board => board.query || '(none)',
  sprints: board => (board.sprints.enabled ? `On (${board.sprints.field?.name ?? 'no field'})` : 'Off'),
  columns: board => (board.columnField ? `${board.columnField.name}: ${list(board.columns.map(columnLabel))}` : 'No columns'),
  swimlanes: board => [board.row.field?.name, board.innerRow?.field?.name].filter(Boolean).join(' › ') || 'None',
  cardFields: board => list(board.cardFields),
  cardColorField: board => board.cardColorField?.name ?? 'None',
  linkTypes: board => list(board.linkTypes),
  // Only ids are stored here; the count tells the two sides apart.
  timeline: board => (board.timeline.field ? `${board.timeline.field.name}, ${board.timeline.sort === 'asc' ? 'oldest' : 'newest'} first` : 'Off'),
  related: board => (board.relatedBoards.length === 1 ? '1 related board' : `${board.relatedBoards.length || 'No'} related boards`)
};

/** One-line description of a group's value, for showing both sides of a conflict. */
export const summarizeGroup = (group: MergeGroup, board: BoardConfig): string => {
  const text = summaries[group](board);
  return text.length > SUMMARY_LENGTH ? `${text.slice(0, SUMMARY_LENGTH - 1)}…` : text;
};

/** What happened to a board after a write, judged from a fresh list. */
export type WriteCheck = 'kept' | 'overwritten' | 'gone';

/**
 * Detects a write lost to a simultaneous one. A later version means someone
 * saved on top of ours, which is fine; the same version with another timestamp
 * means a simultaneous save of this board won; a lower version means a
 * simultaneous save of another board wrote back the old one.
 */
export const detectLostWrite = (expected: BoardConfig, boards: BoardConfig[]): WriteCheck => {
  const found = boards.find(b => b.id === expected.id);
  if (!found) {
    return 'gone';
  }
  if (found.version > expected.version || (found.version === expected.version && found.updatedAt === expected.updatedAt)) {
    return 'kept';
  }
  return 'overwritten';
};
