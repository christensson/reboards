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
