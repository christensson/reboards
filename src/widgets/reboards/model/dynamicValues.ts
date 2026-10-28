import type {DynamicOptions, FieldKind} from '@/common/model/board-config';
import type {FieldValue} from '@/common/youtrack/fields';
import type {YtColor} from '@/common/youtrack/types';
import type {ResolvedField, UniverseValue} from './fieldUniverse';
import type {BoardIssue} from './issue';

/**
 * Columns and swimlanes of dynamic fields (user, version, build) come from the
 * values the board's issues carry, not from the field's whole value set.
 */
export type DynamicValue = {
  key: string;
  label: string;
  color?: YtColor;
  avatarUrl?: string;
  /** Sort date: release (else start) date of a version, assembly date of a build. */
  date?: number;
  /** Issues carrying the value. */
  count: number;
  /** Position in the field's own value order, when the field has one. */
  ordinal?: number;
};

export type DynamicValues = {
  values: DynamicValue[];
  /** Issues with the field empty (or only filtered-out versions); they get a "No <field>" lane first. */
  emptyCount: number;
};

/** Label of the lane for issues without a value, such as "No Assignee". */
export const noValueLabel = (fieldName: string): string => `No ${fieldName}`;

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

const sortDate = (meta: UniverseValue | undefined, kind: FieldKind | 'other' | undefined): number | undefined => {
  if (!meta) {
    return undefined;
  }
  return kind === 'build' ? meta.assembleDate : (meta.releaseDate ?? meta.startDate);
};

/** Released and archived versions are shown only when the options ask for them. */
const isShown = (meta: UniverseValue | undefined, options: DynamicOptions): boolean =>
  !meta || ((options.showReleased || !meta.released) && (options.showArchived || !meta.archived));

/** The issue's values of the field that are shown, in field order; empty when unset or all filtered out. */
export const shownKeys = (issue: BoardIssue, fieldName: string, field: ResolvedField | undefined, options: DynamicOptions): string[] => {
  const keys = issue.fields[fieldName]?.keys ?? [];
  if (field?.kind !== 'version') {
    return keys;
  }
  const metaByKey = new Map(field.values.map(v => [v.key, v]));
  return keys.filter(key => isShown(metaByKey.get(key), options));
};

const compareDates = (a: DynamicValue, b: DynamicValue, direction: number): number => {
  if (a.date === undefined || b.date === undefined) {
    // Undated values go last whatever the direction.
    return (a.date === undefined ? 1 : 0) - (b.date === undefined ? 1 : 0);
  }
  return direction * (a.date - b.date);
};

export const sortDynamicValues = (values: DynamicValue[], sort: DynamicOptions['sort']): DynamicValue[] => {
  const byLabel = (a: DynamicValue, b: DynamicValue): number => collator.compare(a.label, b.label);
  const compare: Record<DynamicOptions['sort'], (a: DynamicValue, b: DynamicValue) => number> = {
    'alphabetical': byLabel,
    'alphabetical-desc': (a, b) => byLabel(b, a),
    'date': (a, b) => compareDates(a, b, 1) || byLabel(a, b),
    'date-desc': (a, b) => compareDates(a, b, -1) || byLabel(a, b),
    // Values outside the field's order (removed from it meanwhile) go last.
    'order': (a, b) => (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER) || byLabel(a, b)
  };
  return [...values].sort(compare[sort]);
};

/** A value seen on an issue, described from the field's values, else from the issue's own value. */
const labelOf = (key: string, meta: UniverseValue | undefined, value: FieldValue | null): string =>
  meta?.label ?? value?.labels[value.keys.indexOf(key)] ?? key;

const describeValue = (key: string, meta: UniverseValue | undefined, value: FieldValue | null, kind: FieldKind | 'other' | undefined): DynamicValue => {
  // Colors and avatars of the issue's own value cover users missing from the project's user list.
  const own = value?.key === key ? value : null;
  const color = meta?.color ?? own?.color;
  const avatarUrl = meta?.avatarUrl ?? own?.avatarUrl;
  const date = sortDate(meta, kind);
  return {
    key,
    label: labelOf(key, meta, value),
    count: 1,
    ...(color ? {color} : {}),
    ...(avatarUrl ? {avatarUrl} : {}),
    ...(date === undefined ? {} : {date}),
    ...(meta ? {ordinal: meta.ordinal} : {})
  };
};

/** The values of a dynamic field across the given issues, filtered and sorted per the options. */
export const dynamicValues = (fieldName: string, field: ResolvedField | undefined, issues: BoardIssue[], options: DynamicOptions): DynamicValues => {
  const metaByKey = new Map((field?.values ?? []).map(v => [v.key, v]));
  const byKey = new Map<string, DynamicValue>();
  let emptyCount = 0;
  issues.forEach(issue => {
    const keys = shownKeys(issue, fieldName, field, options);
    if (keys.length === 0) {
      emptyCount += 1;
      return;
    }
    const value = issue.fields[fieldName] ?? null;
    keys.forEach(key => {
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(key, describeValue(key, metaByKey.get(key), value, field?.kind));
      }
    });
  });
  return {values: sortDynamicValues(Array.from(byKey.values()), options.sort), emptyCount};
};

/**
 * Values offered when assigning a dynamic field on drop: every value of the field in the
 * board's projects plus those seen on issues, filtered and sorted per the options.
 */
export const choosableValues = (fieldName: string, field: ResolvedField | undefined, issues: BoardIssue[], options: DynamicOptions): DynamicValue[] => {
  const byKey = new Map<string, DynamicValue>();
  (field?.values ?? []).forEach(meta => {
    if (isShown(meta, options)) {
      byKey.set(meta.key, {...describeValue(meta.key, meta, null, field?.kind), count: 0});
    }
  });
  const {values} = dynamicValues(fieldName, field, issues, options);
  values.forEach(value => byKey.set(value.key, value));
  return sortDynamicValues(Array.from(byKey.values()), options.sort);
};
