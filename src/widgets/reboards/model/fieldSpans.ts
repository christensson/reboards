import type {FieldUniverse, UniverseValue} from './fieldUniverse';
import type {BoardIssue} from './issue';

/** The span of an issue's values in a version or build field, naming the values at its ends. */
export type ValueSpan = {start?: number; end?: number; startLabel?: string; endLabel?: string};

type Dated = {time: number; label: string};

/** The dates `pick` finds for each value of a version or build field on the issue. */
const fieldDatedValues = (issue: BoardIssue, name: string, universe: FieldUniverse, pick: (meta: UniverseValue) => number | undefined): Dated[] => {
  const metaByKey = new Map((universe.byName.get(name)?.values ?? []).map(v => [v.key, v]));
  return (issue.fields[name]?.keys ?? []).flatMap(key => {
    const meta = metaByKey.get(key);
    const time = meta ? pick(meta) : undefined;
    return time === undefined || time === null ? [] : [{time, label: meta?.label ?? key}];
  });
};

const earliest = (values: Dated[]): Dated | undefined => values.reduce<Dated | undefined>((best, v) => (!best || v.time < best.time ? v : best), undefined);
const latest = (values: Dated[]): Dated | undefined => values.reduce<Dated | undefined>((best, v) => (!best || v.time > best.time ? v : best), undefined);

const spanOf = (first: Dated | undefined, last: Dated | undefined): ValueSpan => ({
  ...(first ? {start: first.time, startLabel: first.label} : {}),
  ...(last ? {end: last.time, endLabel: last.label} : {})
});

/** The span of an issue's versions in a field: from the earliest start (else release) date to the latest release (else start) date. */
export const versionSpan = (issue: BoardIssue, fieldName: string, universe: FieldUniverse): ValueSpan =>
  spanOf(
    earliest(fieldDatedValues(issue, fieldName, universe, v => v.startDate ?? v.releaseDate)),
    latest(fieldDatedValues(issue, fieldName, universe, v => v.releaseDate ?? v.startDate))
  );

/** The span of an issue's builds in a field: from the earliest to the latest assembly date. */
export const buildSpan = (issue: BoardIssue, fieldName: string, universe: FieldUniverse): ValueSpan => {
  const values = fieldDatedValues(issue, fieldName, universe, v => v.assembleDate);
  return spanOf(earliest(values), latest(values));
};
