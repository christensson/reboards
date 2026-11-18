import {type FieldKind, type FieldRef, type PlanLevel, isDateKind, isPlanLevelComplete} from '@/common/model/board-config';
import {type FieldValue, type IssueFieldUpdate, buildFieldUpdate, buildMultiFieldUpdate} from '@/common/youtrack/fields';
import type {FieldUniverse} from './fieldUniverse';
import type {Span} from './gantt';
import type {BoardIssue} from './issue';
import {HOURS_PER_DAY, MINUTES_PER_WORKDAY, MS_PER_DAY, addWorkDays, formatWorkHours, localDay, utcDay, workDaysBetween} from './workTime';

/** Which part of a bar is dragged: an edge, or the whole bar; or a new span drawn on an empty row. */
export type DragHandle = 'start' | 'end' | 'move' | 'draw';

/**
 * What is dragged: a planning level's bar (by index) or the due date diamond of an issue.
 * `create` is a plan the issue does not have yet: drawn on its row, or dragged from the faint bar
 * of its parent's span; it sets every field of the level chosen when confirming.
 */
export type DragTarget = {issueId: string; level: number | 'due'; handle: DragHandle; create?: boolean};

/** A field change of an edit: a date, a period in minutes, or version names. */
export type FieldEdit =
  | {field: FieldRef; type: 'date'; value: number}
  | {field: FieldRef; type: 'period'; minutes: number}
  | {field: FieldRef; type: 'versions'; keys: string[]};

/** "Start date: 3 Nov → 5 Nov": a line of the confirmation. */
export type EditLine = {label: string; from: string; to: string};

export type Edit = {edits: FieldEdit[]; lines: EditLine[]};

/** Dates without a time of day are stored at noon UTC, like YouTrack's own dates. */
const NOON_MS = MS_PER_DAY / 2;
const ALL_HANDLES: DragHandle[] = ['start', 'end', 'move'];
const MINUTES_PER_HOUR = MINUTES_PER_WORKDAY / HOURS_PER_DAY;
/** Slack when rounding an estimate up to whole days, so 16.0000001 hours stay two days. */
const ROUNDING = 1e-6;

const kindOf = (field: FieldRef, universe: FieldUniverse): FieldKind | 'other' => universe.byName.get(field.name)?.kind ?? field.kind;

const asRef = (field: FieldRef, universe: FieldUniverse): FieldRef => {
  const kind = kindOf(field, universe);
  return kind === 'other' ? field : {name: field.name, kind};
};

/** The handles a planning level offers: all three when its fields are of kinds that can be set. */
export const levelHandles = (level: PlanLevel, universe: FieldUniverse): DragHandle[] => {
  if (!isPlanLevelComplete(level) || !level.field) {
    return [];
  }
  const kind = kindOf(level.field, universe);
  if (level.source === 'version') {
    return kind === 'version' ? ALL_HANDLES : [];
  }
  if (!isDateKind(kind)) {
    return [];
  }
  if (level.source === 'date') {
    // A single day: it moves, its two ends are one.
    return ['move'];
  }
  if (level.source === 'dates') {
    return level.endField && isDateKind(kindOf(level.endField, universe)) ? ALL_HANDLES : [];
  }
  return level.periodField && kindOf(level.periodField, universe) === 'period' ? ALL_HANDLES : [];
};

/**
 * The levels an issue can still be planned at: editable levels it has no span at, in level order,
 * then the due date when it can be set and is not.
 */
export const missingLevels = (editable: boolean[], spans: (Span | null)[], dueEditable: boolean, hasDue: boolean): (number | 'due')[] => [
  ...editable.flatMap((can, index) => (can && !spans[index] ? [index] : [])),
  ...(dueEditable && !hasDue ? ['due' as const] : [])
];

/** The span after dragging a handle by whole days; an edge stops at the other end, so a span is at least one day. */
export const draggedSpan = (span: Span, handle: DragHandle, deltaDays: number): Span => {
  const delta = deltaDays * MS_PER_DAY;
  if (handle === 'start') {
    return {start: Math.min(span.start + delta, span.end), end: span.end};
  }
  if (handle === 'end') {
    return {start: span.start, end: Math.max(span.end + delta, span.start)};
  }
  return {start: span.start + delta, end: span.end + delta};
};

/** A span drawn from the pressed day `anchor`, either way. */
export const drawnSpan = (anchor: number, deltaDays: number): Span => {
  const other = anchor + deltaDays * MS_PER_DAY;
  return {start: Math.min(anchor, other), end: Math.max(anchor, other)};
};

/** A plan from a clicked day: as many working days as the estimate (one without), from the first working day. */
export const estimateSpan = (day: number, hours: number | undefined): Span => {
  const days = hours === undefined ? 1 : Math.max(1, Math.ceil(hours / HOURS_PER_DAY - ROUNDING));
  return {start: addWorkDays(day, 1, 1), end: addWorkDays(day, days, 1)};
};

/** A sprint of a version field: its name and days, both ends included. */
export type Sprint = {key: string; start: number; end: number};

/** The dated, not archived values of a version field in date order; archived ones the issue has stay. */
export const sprintsOf = (fieldName: string, universe: FieldUniverse, keep: string[] = []): Sprint[] =>
  (universe.byName.get(fieldName)?.values ?? [])
    .filter(value => !value.archived || keep.includes(value.key))
    .flatMap(value => {
      const first = value.startDate ?? value.releaseDate;
      const last = value.releaseDate ?? value.startDate;
      return first === undefined || last === undefined ? [] : [{key: value.key, start: utcDay(Math.min(first, last)), end: utcDay(Math.max(first, last))}];
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

const nearest = (sprints: Sprint[], day: number, end: (sprint: Sprint) => number): number =>
  sprints.reduce((best, sprint, index) => (Math.abs(end(sprint) - day) < Math.abs(end(sprints[best]) - day) ? index : best), 0);

/** The sprint a day falls in, else the one starting nearest to it. */
export const sprintAt = (sprints: Sprint[], day: number): Sprint | undefined =>
  sprints.find(sprint => sprint.start <= day && day <= sprint.end) ?? (sprints.length > 0 ? sprints[nearest(sprints, day, s => s.start)] : undefined);

const covering = (sprints: Sprint[], start: number, end: number): Sprint[] => sprints.filter(sprint => sprint.start >= start && sprint.end <= end);

const spanOf = (chosen: Sprint[]): Span => ({start: Math.min(...chosen.map(s => s.start)), end: Math.max(...chosen.map(s => s.end))});

/**
 * Snaps a dragged span to sprints. A multi-value field gets every sprint from the snapped start
 * to the snapped end; a move keeps as many sprints as the bar covered. A single-value field gets
 * the one sprint nearest the dragged edge (or start, for a move). Null without sprints.
 */
export const snapToSprints = (dragged: Span, before: Span, handle: DragHandle, sprints: Sprint[], multi: boolean): {span: Span; keys: string[]} | null => {
  if (sprints.length === 0) {
    return null;
  }
  if (handle === 'draw') {
    const touched = multi ? sprints.filter(sprint => sprint.end >= dragged.start && sprint.start <= dragged.end) : [];
    const chosen = touched.length > 0 ? touched : [sprintAt(sprints, dragged.start) as Sprint];
    return {span: spanOf(chosen), keys: chosen.map(s => s.key)};
  }
  if (!multi) {
    const one = sprints[handle === 'end' ? nearest(sprints, dragged.end, s => s.end) : nearest(sprints, dragged.start, s => s.start)];
    return {span: {start: one.start, end: one.end}, keys: [one.key]};
  }
  let chosen: Sprint[];
  if (handle === 'move') {
    const count = Math.max(1, covering(sprints, before.start, before.end).length);
    const from = nearest(sprints, dragged.start, s => s.start);
    chosen = sprints.slice(from, from + count);
  } else if (handle === 'start') {
    const fits = sprints.filter(s => s.end <= before.end);
    const first = fits.length > 0 ? fits[nearest(fits, dragged.start, s => s.start)] : sprints[0];
    chosen = covering(sprints, first.start, Math.max(before.end, first.end));
  } else {
    const fits = sprints.filter(s => s.start >= before.start);
    const last = fits.length > 0 ? fits[nearest(fits, dragged.end, s => s.end)] : sprints[sprints.length - 1];
    chosen = covering(sprints, Math.min(before.start, last.start), last.end);
  }
  return chosen.length > 0 ? {span: spanOf(chosen), keys: chosen.map(s => s.key)} : null;
};

type Format = (day: number) => string;

const storedDate = (issue: BoardIssue, field: FieldRef): number | undefined => {
  const value = Number(issue.fields[field.name]?.key);
  return issue.fields[field.name] && Number.isFinite(value) ? value : undefined;
};

/**
 * The stored value of a new day: noon UTC for dates; "date and time" keeps its local time of day,
 * also across a daylight saving change.
 */
const dateValue = (old: number | undefined, day: number, kind: FieldKind | 'other'): number => {
  if (kind !== 'datetime' || old === undefined) {
    return day + NOON_MS;
  }
  const target = new Date(day);
  const time = new Date(old);
  return new Date(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds()).getTime();
};

const dayOf = (value: number, kind: FieldKind | 'other'): number => (kind === 'datetime' ? localDay(value) : utcDay(value));

/** The edit of a date field set to `day`; none when it already falls on that day. */
const dateEdit = (issue: BoardIssue, field: FieldRef, day: number, universe: FieldUniverse, format: Format): Edit => {
  const kind = kindOf(field, universe);
  const old = storedDate(issue, field);
  if (old !== undefined && dayOf(old, kind) === day) {
    return {edits: [], lines: []};
  }
  return {
    edits: [{field: asRef(field, universe), type: 'date', value: dateValue(old, day, kind)}],
    lines: [{label: field.name, from: old === undefined ? 'none' : format(dayOf(old, kind)), to: format(day)}]
  };
};

/** The edit of a period field set to the working days of a span. */
const periodEdit = (issue: BoardIssue, field: FieldRef, span: Span, universe: FieldUniverse): Edit => {
  const minutes = Math.max(1, workDaysBetween(span.start, span.end)) * MINUTES_PER_WORKDAY;
  const old = issue.fields[field.name]?.minutes;
  if (old === minutes) {
    return {edits: [], lines: []};
  }
  return {
    edits: [{field: asRef(field, universe), type: 'period', minutes}],
    lines: [{label: field.name, from: old === undefined ? 'none' : formatWorkHours(old / MINUTES_PER_HOUR), to: formatWorkHours(minutes / MINUTES_PER_HOUR)}]
  };
};

const NO_EDIT: Edit = {edits: [], lines: []};

/** The edit of a version field set to `keys`; none when it already holds them. */
const versionEdit = (issue: BoardIssue, field: FieldRef, keys: string[], universe: FieldUniverse): Edit => {
  const old = issue.fields[field.name]?.keys ?? [];
  const same = old.length === keys.length && old.every((key, index) => key === keys[index]);
  return same || keys.length === 0
    ? NO_EDIT
    : {edits: [{field: asRef(field, universe), type: 'versions', keys}], lines: [{label: field.name, from: old.join(', ') || 'none', to: keys.join(', ')}]};
};

const merge = (...edits: Edit[]): Edit => ({edits: edits.flatMap(e => e.edits), lines: edits.flatMap(e => e.lines)});

/**
 * The field changes that give a planning level the span `after`: the start and end dates; for a
 * date and period, as if it were two dates: an edge keeps the other end in place, so the date's
 * own edge sets the date and the period, the other edge sets the period (in working days), and
 * only a move keeps the period; for versions, the sprints `keys`.
 */
export const planEdit = (issue: BoardIssue, level: PlanLevel, handle: DragHandle, after: Span, universe: FieldUniverse, format: Format, keys: string[] = []): Edit => {
  const field = level.field;
  if (!field) {
    return NO_EDIT;
  }
  if (level.source === 'version') {
    return versionEdit(issue, field, keys, universe);
  }
  if (level.source === 'dates') {
    return merge(
      handle === 'end' ? NO_EDIT : dateEdit(issue, field, after.start, universe, format),
      handle === 'start' || !level.endField ? NO_EDIT : dateEdit(issue, level.endField, after.end, universe, format)
    );
  }
  const date = dateEdit(issue, field, level.dateRole === 'start' ? after.start : after.end, universe, format);
  if (handle === 'move' || !level.periodField) {
    return date;
  }
  const period = periodEdit(issue, level.periodField, after, universe);
  // The edge the period makes leaves the date where it is; a new plan sets both.
  return handle === level.dateRole || handle === 'draw' ? merge(date, period) : period;
};

/** The change of the due date to `day`. */
export const dueEdit = (issue: BoardIssue, field: FieldRef, day: number, universe: FieldUniverse, format: Format): Edit => dateEdit(issue, field, day, universe, format);

/** The issue as it will be once the edits are saved, to show right away. */
export const editedIssue = (issue: BoardIssue, edits: FieldEdit[]): BoardIssue => {
  const fields = {...issue.fields};
  edits.forEach(edit => {
    const $type = issue.fields[edit.field.name]?.$type ?? '';
    let value: FieldValue;
    if (edit.type === 'date') {
      value = {$type, key: String(edit.value), label: String(edit.value), labels: [String(edit.value)], keys: [String(edit.value)]};
    } else if (edit.type === 'period') {
      value = {$type, key: `${edit.minutes}m`, label: `${edit.minutes}m`, labels: [`${edit.minutes}m`], keys: [`${edit.minutes}m`], minutes: edit.minutes};
    } else {
      value = {$type, key: edit.keys[0], label: edit.keys[0], labels: edit.keys, keys: edit.keys};
    }
    fields[edit.field.name] = value;
  });
  return {...issue, fields};
};

/** The REST custom field updates of the edits. */
export const fieldUpdates = (issue: BoardIssue, edits: FieldEdit[], universe: FieldUniverse): IssueFieldUpdate[] =>
  edits.map(edit => {
    const currentType = issue.fields[edit.field.name]?.$type;
    if (edit.type === 'versions') {
      return universe.byName.get(edit.field.name)?.multi
        ? buildMultiFieldUpdate(edit.field.name, 'version', currentType, edit.keys)
        : buildFieldUpdate(edit.field.name, 'version', currentType, edit.keys[0] ?? null);
    }
    return buildFieldUpdate(edit.field.name, edit.field.kind, currentType, String(edit.type === 'date' ? edit.value : edit.minutes));
  });
