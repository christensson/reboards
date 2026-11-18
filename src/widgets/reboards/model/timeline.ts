import {type BoardConfig, type FieldRef, type PlanLevel, ROWS_BY_DUE, isDateKind, isPlanLevelComplete, placingLevel} from '@/common/model/board-config';
import type {FieldUniverse} from './fieldUniverse';
import {type Span, detailedSpan, fieldDay, issueSchedule, levelSpan} from './gantt';
import type {BoardIssue} from './issue';
import {MS_PER_DAY, localDay, utcDay} from './workTime';

/** Where an issue sits in time; every part is missing when it has no time. */
export type IssueTime = {
  start?: number;
  end?: number;
  /** The day that places the card: the configured end of its span. */
  at?: number;
  /** Versions and builds: the value at `start`, `end` and `at`. */
  startLabel?: string;
  endLabel?: string;
  atLabel?: string;
};

/** What places issues in time rows: a planning level, or the due date. */
export type TimePlacing = {kind: 'level'; level: PlanLevel} | {kind: 'due'; field: FieldRef};

/**
 * What places the time rows: the configured level or due date, else the first complete level,
 * else the due date, so a board whose level was removed still shows rows.
 */
export const timePlacing = (config: BoardConfig): TimePlacing | null => {
  const due = config.gantt.dueField;
  if (config.timeline.rowsBy === ROWS_BY_DUE && due) {
    return {kind: 'due', field: due};
  }
  const level = placingLevel(config);
  if (level && isPlanLevelComplete(level)) {
    return {kind: 'level', level};
  }
  const first = config.gantt.levels.find(isPlanLevelComplete);
  if (first) {
    return {kind: 'level', level: first};
  }
  return due ? {kind: 'due', field: due} : null;
};

/** The name of what places the rows, for "No <name>" and labels. */
export const placingName = (config: BoardConfig): string => {
  const placing = timePlacing(config);
  if (!placing) {
    return 'time';
  }
  return placing.kind === 'due' ? placing.field.name : placing.level.name || placing.level.field?.name || 'plan';
};

/** Whether a time means a start or an end: the due date is an end, a level the configured end. */
export const timeMeaning = (config: BoardConfig): 'start' | 'end' =>
  (timePlacing(config)?.kind === 'due' ? 'end' : config.timeline.position);

/** Where the issue sits in time, per what places the board's time rows; days are UTC days. */
export const issueTime = (issue: BoardIssue, config: BoardConfig, universe: FieldUniverse): IssueTime => {
  const placing = timePlacing(config);
  if (!placing) {
    return {};
  }
  if (placing.kind === 'due') {
    const day = fieldDay(issue, placing.field, universe);
    return day === undefined ? {} : {start: day, end: day, at: day};
  }
  const span = levelSpan(issue, placing.level, universe);
  if (!span) {
    return {};
  }
  const useStart = timeMeaning(config) === 'start';
  const atLabel = useStart ? span.startLabel ?? span.endLabel : span.endLabel ?? span.startLabel;
  return {...span, at: useStart ? span.start : span.end, ...(atLabel === undefined ? {} : {atLabel})};
};

/** Today as a calendar date: the user's local date, as the UTC day calendar dates are stored on. */
export const todayPosition = (now: number): number => localDay(now);

/** Whether a datetime has a time of day worth showing (its local time is not midnight). */
export const hasTimeOfDay = (time: number): boolean => {
  const date = new Date(time);
  return date.getHours() !== 0 || date.getMinutes() !== 0;
};

export type TimingFlag = 'planned-early' | 'late-start' | 'planned-late' | 'overdue' | 'overdue-unassigned';

/** Timing highlights in menu order, worded as the Gantt layout words them; severe ones are real problems, the rest inconsistencies. */
export const TIMING_FLAGS: Record<TimingFlag, {label: string; severe: boolean}> = {
  'planned-early': {label: 'Starts before parent’s plan', severe: false},
  'late-start': {label: 'Late start', severe: true},
  'planned-late': {label: 'Ends after parent’s plan', severe: true},
  'overdue': {label: 'Overdue', severe: true},
  'overdue-unassigned': {label: 'Overdue unassigned', severe: true}
};

/** Every timing highlight, in menu order. */
export const ALL_TIMING_FLAGS = Object.keys(TIMING_FLAGS) as TimingFlag[];

export type TimingContext = {
  config: BoardConfig;
  universe: FieldUniverse;
  now: number;
};

const isUnassigned = (issue: BoardIssue, config: BoardConfig): boolean => {
  const field = config.timeline.assigneeField;
  return Boolean(field) && !issue.fields[field?.name ?? ''];
};

/** The issue's own detailed plan: its finest planning level with a span. */
const ownPlan = (issue: BoardIssue, config: BoardConfig, universe: FieldUniverse): Span | undefined =>
  detailedSpan(issueSchedule(issue, config.gantt, universe));

/** The day work is due: the due date when the board has one, else the end of the placing plan. */
const dueDayOf = (issue: BoardIssue, config: BoardConfig, universe: FieldUniverse): number | undefined =>
  (config.gantt.dueField ? fieldDay(issue, config.gantt.dueField, universe) : issueTime(issue, config, universe).end);

/**
 * Timing problems of an issue, by the Gantt layout's rules. `parent` is its parent on the board,
 * if any: an issue whose own detailed plan starts before its parent's starts early, one ending
 * after it ends late. Overdue is past the due date (or, without one, the plan's end) and not
 * resolved; a late start is past the plan's start, not yet overdue, unassigned and not resolved.
 */
export const timingFlags = (issue: BoardIssue, parent: BoardIssue | undefined, {config, universe, now}: TimingContext): TimingFlag[] => {
  if (!config.timeline.highlights || !timePlacing(config)) {
    return [];
  }
  const today = todayPosition(now);
  const open = !issue.resolved;
  const unassigned = isUnassigned(issue, config);
  const own = ownPlan(issue, config, universe);
  const theirs = parent ? ownPlan(parent, config, universe) : undefined;
  const start = issueTime(issue, config, universe).start;
  const due = dueDayOf(issue, config, universe);
  const overdue = open && due !== undefined && due < today;
  const flags: [TimingFlag, boolean][] = [
    ['planned-early', Boolean(own && theirs && own.start < theirs.start)],
    // Overdue says more: a late start is one that should have started and is not yet overdue.
    ['late-start', open && unassigned && !overdue && start !== undefined && start < today],
    ['planned-late', Boolean(own && theirs && own.end > theirs.end)],
    ['overdue', overdue],
    ['overdue-unassigned', overdue && unassigned]
  ];
  return flags.filter(([, on]) => on).map(([flag]) => flag);
};

/** The due date chip of a card: the day, and whether it is overdue or the plan ends after it. */
export type DueInfo = {day: number; overdue: boolean; overrun: boolean};

export const dueInfo = (issue: BoardIssue, config: BoardConfig, universe: FieldUniverse, now: number): DueInfo | null => {
  const field = config.gantt.dueField;
  const day = field ? fieldDay(issue, field, universe) : undefined;
  if (day === undefined) {
    return null;
  }
  const planEnd = ownPlan(issue, config, universe)?.end;
  return {day, overdue: !issue.resolved && day < todayPosition(now), overrun: planEnd !== undefined && planEnd > day};
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

/** Why each icon is on a card, with the dates involved formatted by `format`, in the Gantt layout's words. */
export const timingNotes = (flags: TimingFlag[], time: IssueTime & {due?: number}, format: (time: number) => string): TimingNote[] => {
  const when = (value: number | undefined): string => (value === undefined ? '' : format(value));
  const notes: TimingNote[] = [];
  if (flags.includes('overdue')) {
    const who = flags.includes('overdue-unassigned') ? ' and unassigned' : '';
    const what = time.due === undefined ? `ended ${when(time.end)}` : `due ${when(time.due)}`;
    notes.push({icon: 'overdue', text: `Overdue${who}: ${what} and not resolved`});
  }
  if (flags.includes('late-start')) {
    notes.push({icon: 'late-start', text: `Late start: should have started ${when(time.start)}, but is unassigned and not resolved`});
  }
  if (flags.includes('planned-late')) {
    notes.push({icon: 'planned-late', text: 'Ends after its parent’s plan'});
  }
  if (flags.includes('planned-early')) {
    notes.push({icon: 'planned-early', text: 'Starts before its parent’s plan'});
  }
  return notes;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** A row of the time layout, as far as a new issue's preset and moves need it. */
export type TimeRowSpot = {time?: number | null; day?: number; timeNames?: string[]};

/**
 * The field that holds the placing end of the plan, so setting it moves an issue to a time row:
 * the due date, a single date, the start or end date of two dates, the date of a date and period
 * when it is the placing end, or a version or build field (by value). Null when the placing end
 * comes from a period.
 */
const placingField = (config: BoardConfig): {field: FieldRef; byValue: boolean} | null => {
  const placing = timePlacing(config);
  if (!placing) {
    return null;
  }
  if (placing.kind === 'due') {
    return {field: placing.field, byValue: false};
  }
  const {level} = placing;
  const position = config.timeline.position;
  if (!level.field) {
    return null;
  }
  if (level.source === 'version' || level.source === 'build') {
    return {field: level.field, byValue: true};
  }
  if (level.source === 'dates') {
    const field = position === 'start' ? level.field : level.endField;
    return field ? {field, byValue: false} : null;
  }
  return level.source === 'date' || level.dateRole === position ? {field: level.field, byValue: false} : null;
};

/** The field value that puts a new issue in a time row: the row's date, or its version or build. */
export const timePreset = (row: TimeRowSpot, config: BoardConfig): {field: string; value: string} | null => {
  const target = placingField(config);
  if (!target || row.time === null || row.time === undefined) {
    return null;
  }
  if (target.byValue) {
    const name = row.timeNames?.[0];
    return name ? {field: target.field.name, value: name} : null;
  }
  const day = new Date(row.day ?? row.time);
  return {field: target.field.name, value: `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`};
};

/** A change of the placing field, shaped like a move's field change. */
export type TimeChange = {field: FieldRef; valueKey: string | null; replaceKey?: string | null};

/** Dates without a time of day are stored at noon UTC, like YouTrack's own dates. */
const NOON_MS = MS_PER_DAY / 2;
const LOCAL_NOON = 12;

/** The stored value of a calendar day: noon UTC for dates, local noon for "date and time". */
const dayValue = (day: number, kind: FieldRef['kind']): number => {
  if (!isDateKind(kind) || kind === 'date') {
    return utcDay(day) + NOON_MS;
  }
  const date = new Date(day);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), LOCAL_NOON).getTime();
};

/**
 * The change that moves an issue from one time row to another, as a swimlane move does: the
 * placing field gets the target row's day, version or build; the "No <name>" row clears it. Null
 * when the placing end comes from a period, which cannot be set directly.
 */
export const timeRowChange = (config: BoardConfig, from: TimeRowSpot, to: TimeRowSpot): TimeChange | null => {
  const target = placingField(config);
  if (!target) {
    return null;
  }
  const {field, byValue} = target;
  // Versions name the value the card leaves, so a multi-value field swaps just that one.
  const replace = byValue ? {replaceKey: from.timeNames?.[0] ?? null} : {};
  if (to.time === null || to.time === undefined) {
    return {field, valueKey: null, ...replace};
  }
  if (byValue) {
    const name = to.timeNames?.[0];
    return name ? {field, valueKey: name, ...replace} : null;
  }
  return {field, valueKey: String(dayValue(to.day ?? to.time, field.kind))};
};
