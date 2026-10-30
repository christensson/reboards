import * as entities from '@jetbrains/youtrack-scripting-api/entities';
import * as search from '@jetbrains/youtrack-scripting-api/search';
import type {User} from '@jetbrains/youtrack-scripting-api/entities';
import {ALL_PAGE, type BoardConfig, type FieldRef, NO_VALUE_PAGE, availableRowModes, isDynamicField, ownSprintField} from '@/common/model/board-config';
import {type FieldValues, placeIssue} from '@/common/model/placement';
import {effectiveQuery} from '@/common/youtrack/query';
import {sprintForDate} from '@/widgets/reboards/model/sprints';
import {projectAccessFor, projectAdminFor} from './access';
import {loadBoards, viewerOf} from './owners';
import {ADMIN_PERMISSION, type GlobalStorageLike, canEdit, visibleBoards} from './store';

/** What an MCP tool's `execute` receives. */
export type ToolContext<A> = {
  arguments: A;
  currentUser: User;
  globalStorage: GlobalStorageLike;
};

/** The boards the calling user can see, as on the ReBoards board list. */
export const boardsFor = (ctx: ToolContext<unknown>): BoardConfig[] =>
  visibleBoards(loadBoards(ctx.globalStorage), viewerOf(ctx.currentUser), projectAccessFor(ctx.currentUser));

export const canEditBoard = (ctx: ToolContext<unknown>, board: BoardConfig): boolean =>
  canEdit(board, viewerOf(ctx.currentUser), ctx.currentUser.hasPermission(ADMIN_PERMISSION), projectAdminFor(ctx.currentUser));

/** A visible board by id, or by its name (case does not matter); unknown and hidden boards are not found. */
export const findBoard = (ctx: ToolContext<unknown>, idOrName: string): BoardConfig => {
  const boards = boardsFor(ctx);
  const wanted = idOrName.trim().toLowerCase();
  const board = boards.find(b => b.id === idOrName) ?? boards.find(b => b.name.trim().toLowerCase() === wanted);
  if (!board) {
    throw new Error(`Board not found: ${idOrName}. Use reboards_list_boards to see the boards you can open.`);
  }
  return board;
};

export type FieldInfo = {name: string; type: string; multiValue: boolean};

/** A field as the agent needs it to update an issue: its name, YouTrack type and whether it holds several values. */
export const fieldInfo = (board: BoardConfig, field: FieldRef): FieldInfo => {
  let type: string = field.kind;
  board.projects.some(ref => {
    try {
      const projectField = entities.Project.findByKey(ref.shortName)?.findFieldByName(field.name);
      if (projectField) {
        type = projectField.typeName;
        return true;
      }
    } catch {
      // A project that is gone or renamed simply does not tell.
    }
    return false;
  });
  return {name: field.name, type, multiValue: /\[\*\]|multi/iu.test(type)};
};

type Dated = {name: string; startDate?: number; releaseDate?: number; isArchived?: boolean};

/** Sprint names with their dates, oldest first, plus the current one. */
export type SprintList = {source: 'field' | 'agile'; current: string | null; sprints: {name: string; start: number | null; finish: number | null}[]};

const toSprintList = (source: SprintList['source'], dated: Dated[], current: string | null): SprintList => ({
  source,
  current,
  sprints: dated
    .filter(d => !d.isArchived)
    .map(d => ({name: d.name, start: d.startDate ?? null, finish: d.releaseDate ?? null}))
});

/** The items of a YouTrack `Set` (or anything with `forEach`); empty for null. */
const iterate = <T>(set: unknown): T[] => {
  const items: T[] = [];
  (set as {forEach?: (fn: (item: T) => void) => void} | null | undefined)?.forEach?.(item => items.push(item));
  return items;
};

/** The values of the board's own sprint field across its projects, with their dates. */
const fieldSprints = (board: BoardConfig, field: FieldRef): SprintList => {
  const byName = new Map<string, Dated>();
  board.projects.forEach(ref => {
    try {
      const projectField = entities.Project.findByKey(ref.shortName)?.findFieldByName(field.name) as unknown as {values?: unknown} | null;
      iterate<Dated>(projectField?.values).forEach(value => {
        if (!byName.has(value.name)) {
          byName.set(value.name, {name: value.name, startDate: value.startDate || undefined, releaseDate: value.releaseDate || undefined});
        }
      });
    } catch {
      // Skip projects that cannot be read.
    }
  });
  const dated = Array.from(byName.values());
  const current = sprintForDate(dated.map((d, index) => ({key: d.name, label: d.name, ordinal: index, startDate: d.startDate, releaseDate: d.releaseDate})), Date.now());
  return toSprintList('field', dated, current);
};

type AgileLike = {name: string; currentSprint?: {name: string} | null; sprints?: unknown};

/** The linked agile board, by the name saved with the link. */
const linkedAgile = (board: BoardConfig): AgileLike | null => {
  const name = board.agileSource?.name;
  if (!name) {
    return null;
  }
  try {
    return iterate<AgileLike>(entities.Agile.findByName(name))[0] ?? null;
  } catch {
    return null;
  }
};

/** The sprints the board's sprint selector offers; null for boards without sprints. */
export const sprintsOf = (board: BoardConfig): SprintList | null => {
  if (board.agileSource) {
    const agile = linkedAgile(board);
    if (!agile) {
      return null;
    }
    const dated = iterate<{name: string; start: number; finish: number; isArchived: boolean}>(agile.sprints)
      .map(s => ({name: s.name, startDate: s.start || undefined, releaseDate: s.finish || undefined, isArchived: s.isArchived}));
    return toSprintList('agile', dated, agile.currentSprint?.name ?? null);
  }
  const field = ownSprintField(board);
  return field ? fieldSprints(board, field) : null;
};

/** Whether the board's columns or a swimlane level take their lanes from the issues' values. */
export const lanesFromValues = (field: FieldRef, options: BoardConfig['columnOptions']): boolean => isDynamicField(field.kind, options);

export const layoutsOf = (board: BoardConfig) => availableRowModes(board);

/** Value keys of a field of an issue: user logins, value names, or numbers (dates, periods) as text. */
const keysOf = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return [String(value)];
  }
  const item = value as {login?: string; name?: string; presentation?: string; forEach?: (fn: (v: unknown) => void) => void};
  if (typeof item.forEach === 'function' && item.login === undefined && item.name === undefined) {
    const keys: string[] = [];
    item.forEach(v => keys.push(...keysOf(v)));
    return keys;
  }
  return [item.login ?? item.name ?? item.presentation ?? String(value)];
};

/** The fields of a board that decide where an issue shows: column, swimlanes, sprint and time fields. */
export const boardFieldNames = (board: BoardConfig): string[] =>
  Array.from(new Set([
    board.columnField?.name,
    board.row.field?.name,
    board.innerRow?.field?.name,
    ownSprintField(board)?.name,
    board.timeline.field?.name,
    board.timeline.periodField?.name,
    board.pages.mode === 'field' ? board.pages.field?.name : undefined
  ].filter((name): name is string => Boolean(name))));

export type ListedIssue = {
  id: string;
  summary: string;
  resolved: boolean;
  columns: string[];
  swimlanes: string[] | null;
  innerSwimlanes: string[] | null;
  parent: string | null;
  fields: FieldValues;
};

type IssueLike = {
  id: string;
  summary: string;
  isResolved: boolean;
  fields: Record<string, unknown>;
  links: Record<string, unknown>;
};

/** Which issues to list: one sprint, the issues in no sprint, or (linked agile boards) every issue on the board. */
export type SprintChoice = {kind: 'sprint'; name: string} | {kind: 'unscheduled'} | {kind: 'all'};

/**
 * The pages of the board's page selector, for describing the board; null without pages. Field pages
 * list the chosen values, or say that every value is a page.
 */
export const pagesOf = (board: BoardConfig) => {
  const {mode, field, values, pages} = board.pages;
  if (mode === 'queries') {
    return {source: 'queries', pages: pages.map(p => ({name: p.name, query: p.query})), note: 'Each page has its own query, combined with the projects and the sprint.'};
  }
  if (mode !== 'field' || !field) {
    return null;
  }
  const noValue = `No ${field.name}`;
  return {
    source: 'field',
    field: field.name,
    ...(values.length > 0
      ? {pages: ['All', ...values.map(value => (value === NO_VALUE_PAGE ? noValue : value))]}
      : {note: `"All", one page per value of ${field.name} (pass the value name, or the login for users) and "${noValue}" (pass "none").`})
  };
};

/**
 * The page key for a tool's `page` argument: "all", "none", a field value or a query page's name.
 * Without one, field pages show all issues and query pages any page's issues.
 */
export const pageArgument = (board: BoardConfig, page: string | undefined): string | null => {
  const wanted = page?.trim();
  const {mode, field, values, pages} = board.pages;
  if (mode === 'none' || !wanted) {
    return mode === 'field' ? ALL_PAGE : null;
  }
  const lower = wanted.toLowerCase();
  if (mode === 'queries') {
    const match = pages.find(p => p.name.trim().toLowerCase() === lower) ?? pages.find(p => p.id === wanted);
    if (!match) {
      throw new Error(`Unknown page "${wanted}"; pass one of: ${pages.map(p => p.name).join(', ')}.`);
    }
    return match.id;
  }
  if (lower === 'all') {
    return ALL_PAGE;
  }
  if (lower === 'none' || lower === `no ${field?.name ?? ''}`.toLowerCase()) {
    return NO_VALUE_PAGE;
  }
  if (values.length === 0) {
    return wanted;
  }
  const match = values.find(value => value.toLowerCase() === lower);
  if (!match) {
    throw new Error(`Unknown page "${wanted}"; pass "all" or one of: ${values.map(v => (v === NO_VALUE_PAGE ? 'none' : v)).join(', ')}.`);
  }
  return match;
};

/** Runs the board's query (on a page, when given) as the calling user and describes each issue's place on the board. */
export const boardIssues = (ctx: ToolContext<unknown>, board: BoardConfig, choice: SprintChoice, page: string | null = null): ListedIssue[] => {
  const sprint = choice.kind === 'sprint' ? choice.name : null;
  const agile = board.agileSource ? {name: board.agileSource.name, sprintsEnabled: choice.kind !== 'all'} : undefined;
  const query = effectiveQuery(board, sprint, agile, page);
  const names = boardFieldNames(board);
  const found = iterate<IssueLike>(search.search(null as never, query, ctx.currentUser));
  return found.map(issue => {
    const fields: FieldValues = {};
    names.forEach(name => {
      let value: unknown = null;
      try {
        value = issue.fields[name];
      } catch {
        // The field is not in this issue's project.
      }
      fields[name] = keysOf(value);
    });
    const parent = iterate<{id: string}>(issue.links['subtask of'])[0]?.id ?? null;
    return {id: issue.id, summary: issue.summary, resolved: issue.isResolved, ...placeIssue(board, fields), parent, fields};
  });
};
