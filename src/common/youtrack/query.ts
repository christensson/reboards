import {ALL_PAGE, type BoardConfig, NO_VALUE_PAGE} from '@/common/model/board-config';

/** The search name of an agile board, as used in `{Board <name>}: {<sprint>}`. */
export const boardSearchField = (agileName: string): string => `Board ${agileName}`;

export type ComposeQueryInput = {
  projects: string[];
  query: string;
  sprintField?: string | null;
  sprint?: string | null;
};

/** Wraps a YouTrack search token in braces unless it is a plain word. */
export const quoteToken = (token: string): string => (/^[\w.-]+$/u.test(token) ? token : `{${token}}`);

/**
 * Composes the effective board query:
 * `project: {A}, {B} and (<user query>) and <SprintField>: {<sprint>}`.
 * With a sprint field but no sprint, the board shows unscheduled issues:
 * `has: -<SprintField>` matches issues where the field is empty.
 */
export const composeQuery = ({projects, query, sprintField, sprint}: ComposeQueryInput): string => {
  const parts: string[] = [];
  if (projects.length > 0) {
    parts.push(`project: ${projects.map(quoteToken).join(', ')}`);
  }
  const trimmed = query.trim();
  if (trimmed) {
    parts.push(parts.length > 0 ? `(${trimmed})` : trimmed);
  }
  if (sprintField) {
    parts.push(sprint ? `${quoteToken(sprintField)}: ${quoteToken(sprint)}` : `has: -${quoteToken(sprintField)}`);
  }
  return parts.join(' and ');
};

export type ComposeAgileQueryInput = {
  /** Search name of the agile board, `Board <name>`. */
  boardField: string;
  /** The board has sprints: show one sprint (or, with none, the board's backlog). */
  sprintsEnabled: boolean;
  sprint: string | null;
  /** Extra filter of the ReBoards board. */
  query: string;
  /** The board's projects: the backlog (issues not on the board) is limited to them. */
  projects: string[];
};

/**
 * The issues of an agile board, narrowed by the extra filter:
 * `{Board X}: {sprint}`, `project: … and has: -{Board X}` (its backlog) without a sprint, or
 * `has: {Board X}` for a board without sprints.
 */
export const composeAgileQuery = ({boardField, sprintsEnabled, sprint, query, projects}: ComposeAgileQueryInput): string => {
  const board = sprintsEnabled
    ? composeQuery({projects: sprint ? [] : projects, query: '', sprintField: boardField, sprint})
    : `has: ${quoteToken(boardField)}`;
  const trimmed = query.trim();
  return trimmed ? `${board} and (${trimmed})` : board;
};

/** Field pages: the clause of one value, or of issues without one; null for "All" and no page. */
const fieldPageClause = (fieldName: string, page: string | null | undefined): string | null => {
  if (!page || page === ALL_PAGE) {
    return null;
  }
  return page === NO_VALUE_PAGE ? `has: -${quoteToken(fieldName)}` : `${quoteToken(fieldName)}: ${quoteToken(page)}`;
};

/** Query pages without a page (every page at once): any page's issues; an empty page query matches all. */
const anyPageQuery = (queries: string[]): string =>
  queries.some(query => !query) ? '' : queries.map(query => (queries.length > 1 ? `(${query})` : query)).join(' or ');

/**
 * The query the board filters by on a page: the board query, narrowed to a field page's value, or
 * replaced by a query page's query. Without a page, query pages show any page's issues.
 */
export const pageQuery = (config: BoardConfig, page?: string | null): string => {
  const {mode, field, pages} = config.pages;
  if (mode === 'queries') {
    const queries = pages.map(p => p.query.trim());
    const selected = pages.find(p => p.id === page);
    return selected ? selected.query.trim() : anyPageQuery(queries);
  }
  const trimmed = config.query.trim();
  const clause = mode === 'field' && field ? fieldPageClause(field.name, page) : null;
  if (!clause) {
    return trimmed;
  }
  return trimmed ? `(${trimmed}) and ${clause}` : clause;
};

/**
 * The board's search query. A board linked to an agile board shows that board's issues (by its
 * live name, else the one saved), with the board's own query as an extra filter. `page` is the
 * key of the page shown (see `pageQuery`).
 */
export const effectiveQuery = (
  config: BoardConfig,
  sprint: string | null,
  agile?: {name: string; sprintsEnabled: boolean},
  page?: string | null
): string => {
  const query = pageQuery(config, page);
  if (config.agileSource) {
    return composeAgileQuery({
      boardField: boardSearchField(agile?.name ?? config.agileSource.name),
      sprintsEnabled: agile?.sprintsEnabled ?? true,
      sprint,
      query,
      projects: config.projects.map(p => p.shortName)
    });
  }
  return composeQuery({
    projects: config.projects.map(p => p.shortName),
    query,
    sprintField: config.sprints.enabled ? config.sprints.field?.name : null,
    sprint: config.sprints.enabled ? sprint : null
  });
};

