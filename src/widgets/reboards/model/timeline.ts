import {type TimelineConfig, isDateKind} from '@/common/model/board-config';
import type {FieldUniverse, UniverseValue} from './fieldUniverse';
import type {BoardIssue} from './issue';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Where an issue sits in time; every part is missing when the time field is empty. */
export type IssueTime = {
  start?: number;
  end?: number;
  /** The point that places the card: the configured end of a range, else the other one. */
  at?: number;
  /** Versions and builds: the value at `start`, `end` and `at`. */
  startLabel?: string;
  endLabel?: string;
  atLabel?: string;
};

type Dated = {time: number; label: string};

const datedValues = (issue: BoardIssue, timeline: TimelineConfig, universe: FieldUniverse, pick: (meta: UniverseValue) => number | undefined): Dated[] => {
  const name = timeline.field?.name ?? '';
  const metaByKey = new Map((universe.byName.get(name)?.values ?? []).map(v => [v.key, v]));
  return (issue.fields[name]?.keys ?? []).flatMap(key => {
    const meta = metaByKey.get(key);
    const time = meta ? pick(meta) : undefined;
    return time === undefined || time === null ? [] : [{time, label: meta?.label ?? key}];
  });
};

const earliest = (values: Dated[]): Dated | undefined => values.reduce<Dated | undefined>((best, v) => (!best || v.time < best.time ? v : best), undefined);
const latest = (values: Dated[]): Dated | undefined => values.reduce<Dated | undefined>((best, v) => (!best || v.time > best.time ? v : best), undefined);

/** Start and end of a date field, made a range by the period field: the date is the start or the end. */
const dateRange = (issue: BoardIssue, timeline: TimelineConfig): Pick<IssueTime, 'start' | 'end'> => {
  const value = Number(issue.fields[timeline.field?.name ?? '']?.key);
  if (!Number.isFinite(value) || !issue.fields[timeline.field?.name ?? '']) {
    return {};
  }
  const minutes = timeline.periodField ? issue.fields[timeline.periodField.name]?.minutes : undefined;
  if (minutes === undefined) {
    return {start: value, end: value};
  }
  const span = minutes * MS_PER_MINUTE;
  return timeline.dateRole === 'start' ? {start: value, end: value + span} : {start: value - span, end: value};
};

/** Versions run from the earliest start (else release) date to the latest release (else start) date. */
const versionRange = (issue: BoardIssue, timeline: TimelineConfig, universe: FieldUniverse): Omit<IssueTime, 'at' | 'atLabel'> => {
  const first = earliest(datedValues(issue, timeline, universe, v => v.startDate ?? v.releaseDate));
  const last = latest(datedValues(issue, timeline, universe, v => v.releaseDate ?? v.startDate));
  return {
    ...(first ? {start: first.time, startLabel: first.label} : {}),
    ...(last ? {end: last.time, endLabel: last.label} : {})
  };
};

const buildRange = (issue: BoardIssue, timeline: TimelineConfig, universe: FieldUniverse): Omit<IssueTime, 'at' | 'atLabel'> => {
  const values = datedValues(issue, timeline, universe, v => v.assembleDate);
  const first = earliest(values);
  const last = latest(values);
  return {
    ...(first ? {start: first.time, startLabel: first.label} : {}),
    ...(last ? {end: last.time, endLabel: last.label} : {})
  };
};

const kindOf = (timeline: TimelineConfig, universe: FieldUniverse) =>
  universe.byName.get(timeline.field?.name ?? '')?.kind ?? timeline.field?.kind;

/** A date field without a period is a single point; versions, builds and dates with a period have two ends. */
export const hasRange = (timeline: TimelineConfig, universe: FieldUniverse): boolean => {
  const kind = kindOf(timeline, universe);
  return kind === 'version' || (isDateKind(kind) && Boolean(timeline.periodField));
};

/** Which end a single time means: the configured position for ranges, else the date's role. */
export const timeMeaning = (timeline: TimelineConfig, universe: FieldUniverse): 'start' | 'end' =>
  hasRange(timeline, universe) ? timeline.position : timeline.dateRole;

/** Where the issue sits in time, per the board's time field. */
export const issueTime = (issue: BoardIssue, timeline: TimelineConfig, universe: FieldUniverse): IssueTime => {
  const kind = kindOf(timeline, universe);
  let range: Omit<IssueTime, 'at' | 'atLabel'> = {};
  if (isDateKind(kind)) {
    range = dateRange(issue, timeline);
  } else if (kind === 'version') {
    range = versionRange(issue, timeline, universe);
  } else if (kind === 'build') {
    range = buildRange(issue, timeline, universe);
  }
  const useStart = timeMeaning(timeline, universe) === 'start';
  const at = useStart ? (range.start ?? range.end) : (range.end ?? range.start);
  const atLabel = useStart ? (range.startLabel ?? range.endLabel) : (range.endLabel ?? range.startLabel);
  return {...range, ...(at === undefined ? {} : {at}), ...(atLabel === undefined ? {} : {atLabel})};
};

/** "Date and time" fields keep the exact time; all other sources are calendar dates. */
export const isExactTime = (timeline: TimelineConfig, universe: FieldUniverse): boolean => kindOf(timeline, universe) === 'datetime';

/** The UTC day a calendar date falls on. */
const utcDay = (time: number): number => Math.floor(time / MS_PER_DAY) * MS_PER_DAY;

/** The comparable position of a time: the exact time for "date and time" fields, else its calendar day. */
export const timePosition = (time: number, exact: boolean): number => (exact ? time : utcDay(time));

/** Today as a calendar date: the user's local date, as the UTC day calendar dates are stored on. */
export const todayPosition = (now: number): number => {
  const date = new Date(now);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

/** Whether a datetime has a time of day worth showing (its local time is not midnight). */
export const hasTimeOfDay = (time: number): boolean => {
  const date = new Date(time);
  return date.getHours() !== 0 || date.getMinutes() !== 0;
};

export type TimingFlag = 'planned-early' | 'late-start' | 'planned-late' | 'overdue' | 'overdue-unassigned';

/** Timing highlights in menu order, with what each means; severe ones are real problems, the rest inconsistencies. */
export const TIMING_FLAGS: Record<TimingFlag, {label: string; meaning: 'start' | 'end'; severe: boolean}> = {
  'planned-early': {label: 'Planned early', meaning: 'start', severe: false},
  'late-start': {label: 'Late start', meaning: 'start', severe: true},
  'planned-late': {label: 'Planned late', meaning: 'end', severe: true},
  'overdue': {label: 'Overdue', meaning: 'end', severe: true},
  'overdue-unassigned': {label: 'Overdue unassigned', meaning: 'end', severe: true}
};

export const timingFlagsFor = (meaning: 'start' | 'end'): TimingFlag[] =>
  (Object.keys(TIMING_FLAGS) as TimingFlag[]).filter(flag => TIMING_FLAGS[flag].meaning === meaning);

export type TimingContext = {
  timeline: TimelineConfig;
  universe: FieldUniverse;
  now: number;
};

const isUnassigned = (issue: BoardIssue, timeline: TimelineConfig): boolean =>
  Boolean(timeline.assigneeField) && !issue.fields[timeline.assigneeField?.name ?? ''];

type FlagCheck = {
  own: IssueTime;
  /** The parent's time; empty without a parent on the board. */
  theirs: IssueTime;
  pos: (time: number) => number;
  past: (time: number) => boolean;
  open: boolean;
  unassigned: boolean;
};

const startFlags = ({own, theirs, pos, past, open, unassigned}: FlagCheck): TimingFlag[] => {
  if (own.start === undefined) {
    return [];
  }
  const early = theirs.start !== undefined && pos(own.start) < pos(theirs.start);
  const late = open && unassigned && past(own.start);
  return [...(early ? ['planned-early' as const] : []), ...(late ? ['late-start' as const] : [])];
};

const endFlags = ({own, theirs, pos, past, open, unassigned}: FlagCheck): TimingFlag[] => {
  if (own.end === undefined) {
    return [];
  }
  const late = theirs.end !== undefined && pos(own.end) > pos(theirs.end);
  const overdue = open && past(own.end);
  return [
    ...(late ? ['planned-late' as const] : []),
    ...(overdue ? ['overdue' as const] : []),
    ...(overdue && unassigned ? ['overdue-unassigned' as const] : [])
  ];
};

/**
 * Timing problems of an issue. `parent` is its parent on the board, if any: a subtask starting
 * before its parent is planned early, one ending after it planned late.
 */
export const timingFlags = (issue: BoardIssue, parent: BoardIssue | undefined, {timeline, universe, now}: TimingContext): TimingFlag[] => {
  if (!timeline.highlights || !timeline.field) {
    return [];
  }
  const exact = isExactTime(timeline, universe);
  const pos = (time: number) => timePosition(time, exact);
  const check: FlagCheck = {
    own: issueTime(issue, timeline, universe),
    theirs: parent ? issueTime(parent, timeline, universe) : {},
    pos,
    past: time => pos(time) < (exact ? now : todayPosition(now)),
    open: !issue.resolved,
    unassigned: isUnassigned(issue, timeline)
  };
  return timeMeaning(timeline, universe) === 'start' ? startFlags(check) : endFlags(check);
};

/** Quick filter keys of the timing highlights; other quick filters are field names. */
const TIMING_FILTER_PREFIX = 'flag:';

export const timingFilterKey = (flag: TimingFlag): string => `${TIMING_FILTER_PREFIX}${flag}`;

/** The timing flag a quick filter key stands for, if it is one. */
export const timingFlagOfFilter = (key: string | null): TimingFlag | null =>
  key?.startsWith(TIMING_FILTER_PREFIX) ? (key.slice(TIMING_FILTER_PREFIX.length) as TimingFlag) : null;

/** Card icons: overdue issues get one icon whether or not they are also unassigned. */
export type TimingIcon = 'overdue' | 'late-start' | 'planned-late' | 'planned-early';

export type TimingNote = {icon: TimingIcon; text: string};

/** Why each icon is on a card, with the dates involved formatted by `format`. */
export const timingNotes = (flags: TimingFlag[], time: IssueTime, format: (time: number) => string): TimingNote[] => {
  const when = (value: number | undefined): string => (value === undefined ? '' : format(value));
  const notes: TimingNote[] = [];
  if (flags.includes('overdue')) {
    const who = flags.includes('overdue-unassigned') ? ' and unassigned' : '';
    notes.push({icon: 'overdue', text: `Overdue${who}: ended ${when(time.end)} and is not resolved`});
  }
  if (flags.includes('late-start')) {
    notes.push({icon: 'late-start', text: `Late start: should have started ${when(time.start)}, but is unassigned and not resolved`});
  }
  if (flags.includes('planned-late')) {
    notes.push({icon: 'planned-late', text: `Planned late: ends ${when(time.end)}, after its parent ends`});
  }
  if (flags.includes('planned-early')) {
    notes.push({icon: 'planned-early', text: `Planned early: starts ${when(time.start)}, before its parent starts`});
  }
  return notes;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** A row of the time layout, as far as a new issue's preset needs it. */
export type TimeRowSpot = {time?: number | null; withTime?: boolean; day?: number; timeNames?: string[]};

/**
 * The field value that puts a new issue in a time row: the row's date (with its time of day) for
 * date fields, or its version or build. None when the row's time is not the field's own value,
 * such as the other end of a date plus period.
 */
export const timePreset = (row: TimeRowSpot, timeline: TimelineConfig, universe: FieldUniverse): {field: string; value: string} | null => {
  const field = timeline.field;
  if (!field || row.time === null || row.time === undefined) {
    return null;
  }
  const kind = kindOf(timeline, universe);
  if (!isDateKind(kind)) {
    const name = row.timeNames?.[0];
    return name ? {field: field.name, value: name} : null;
  }
  if (timeline.periodField && timeMeaning(timeline, universe) !== timeline.dateRole) {
    return null;
  }
  if (row.withTime) {
    const date = new Date(row.time);
    return {field: field.name, value: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`};
  }
  const day = new Date(row.day ?? row.time);
  return {field: field.name, value: `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`};
};

/** A change of the time field, shaped like a move's field change. */
export type TimeChange = {field: NonNullable<TimelineConfig['field']>; valueKey: string | null; replaceKey?: string | null};

/** Dates without a time of day are stored at noon UTC, like YouTrack's own dates. */
const NOON_MS = MS_PER_DAY / 2;

/**
 * The time field change that moves an issue from one time row to another, as a swimlane move
 * does: the target's date (or time), version or build; the "No <field>" row clears it. Null when
 * the row's time is not the field's own value, such as the other end of a date plus period.
 */
export const timeRowChange = (timeline: TimelineConfig, from: TimeRowSpot, to: TimeRowSpot): TimeChange | null => {
  const field = timeline.field;
  if (!field) {
    return null;
  }
  const isDate = isDateKind(field.kind);
  // Versions name the value the card leaves, so a multi-value field swaps just that one.
  const replace = isDate ? {} : {replaceKey: from.timeNames?.[0] ?? null};
  if (to.time === null || to.time === undefined) {
    return {field, valueKey: null, ...replace};
  }
  if (!isDate) {
    const name = to.timeNames?.[0];
    return name ? {field, valueKey: name, ...replace} : null;
  }
  const range = Boolean(timeline.periodField);
  if (range && timeline.position !== timeline.dateRole) {
    return null;
  }
  const value = field.kind === 'datetime' ? to.time : utcDay(to.day ?? to.time) + NOON_MS;
  return {field, valueKey: String(value)};
};
