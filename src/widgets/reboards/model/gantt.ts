import {type FieldRef, type GanttConfig, type PlanLevel, isPlanLevelComplete} from '@/common/model/board-config';
import {computeEdges, type Edge} from './connectors';
import type {FieldUniverse} from './fieldUniverse';
import {type BoardIssue, SUBTASK_LINK_TYPE, compareIssues} from './issue';
import {buildSpan, versionSpan} from './fieldSpans';
import {MS_PER_DAY, addWorkDays, estimateHours, localDay, periodWorkDays, personsNeeded, utcDay, workDaysBetween} from './workTime';

const todayPosition = localDay;

/** Planned days of an issue, both ends included, as UTC days. Versions name the values at the ends. */
export type Span = {start: number; end: number; startLabel?: string; endLabel?: string};

export type IssueSchedule = {
  /** One entry per planning level (high-level first); null where the issue has no plan at that level. */
  spans: (Span | null)[];
  /** The due day. */
  due?: number;
  /** The due field's own value, for display. */
  dueTime?: number;
  /** The estimate in working hours. */
  estimate?: number;
};

const fieldKind = (field: FieldRef, universe: FieldUniverse) => universe.byName.get(field.name)?.kind ?? field.kind;

/** The calendar day of a date field: "date and time" values on the user's local date. */
export const fieldDay = (issue: BoardIssue, field: FieldRef | null, universe: FieldUniverse): number | undefined => {
  if (!field || !issue.fields[field.name]) {
    return undefined;
  }
  const value = Number(issue.fields[field.name]?.key);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return fieldKind(field, universe) === 'datetime' ? localDay(value) : utcDay(value);
};

const ordered = (start: number, end: number, labels: Pick<Span, 'startLabel' | 'endLabel'> = {}): Span =>
  (end < start ? {start: end, end: start} : {start, end, ...labels});

/** The span of a version or build field's values (their dates, or assembly dates), named by the values at its ends. */
const valueLevelSpan = (issue: BoardIssue, field: FieldRef, universe: FieldUniverse, source: 'version' | 'build'): Span | null => {
  const {start, end, startLabel, endLabel} = (source === 'version' ? versionSpan : buildSpan)(issue, field.name, universe);
  const first = start ?? end;
  const last = end ?? start;
  if (first === undefined || last === undefined) {
    return null;
  }
  return ordered(utcDay(first), utcDay(last), {...(startLabel ? {startLabel} : {}), ...(endLabel ? {endLabel} : {})});
};

const periodLevelSpan = (issue: BoardIssue, level: PlanLevel, universe: FieldUniverse): Span | null => {
  const day = fieldDay(issue, level.field, universe);
  if (day === undefined) {
    return null;
  }
  const minutes = level.periodField ? issue.fields[level.periodField.name]?.minutes : undefined;
  if (minutes === undefined) {
    return {start: day, end: day};
  }
  const days = periodWorkDays(minutes);
  return level.dateRole === 'start' ? {start: day, end: addWorkDays(day, days, 1)} : {start: addWorkDays(day, days, -1), end: day};
};

/** Where an issue is planned at one level; null without a plan there. */
export const levelSpan = (issue: BoardIssue, level: PlanLevel, universe: FieldUniverse): Span | null => {
  if (!isPlanLevelComplete(level) || !level.field) {
    return null;
  }
  if (level.source === 'version' || level.source === 'build') {
    return valueLevelSpan(issue, level.field, universe, level.source);
  }
  if (level.source === 'date') {
    const day = fieldDay(issue, level.field, universe);
    return day === undefined ? null : {start: day, end: day};
  }
  if (level.source === 'date-period') {
    return periodLevelSpan(issue, level, universe);
  }
  const start = fieldDay(issue, level.field, universe);
  const end = fieldDay(issue, level.endField, universe);
  if (start === undefined && end === undefined) {
    return null;
  }
  return ordered(start ?? end ?? 0, end ?? start ?? 0);
};

export const issueSchedule = (issue: BoardIssue, gantt: GanttConfig, universe: FieldUniverse): IssueSchedule => {
  const due = fieldDay(issue, gantt.dueField, universe);
  const estimate = estimateHours(issue, gantt, universe);
  return {
    spans: gantt.levels.map(level => levelSpan(issue, level, universe)),
    ...(due === undefined ? {} : {due, dueTime: Number(issue.fields[gantt.dueField?.name ?? '']?.key)}),
    ...(estimate === undefined ? {} : {estimate})
  };
};

/** The most detailed planned span: the last level with a plan. */
export const detailedSpan = (schedule: IssueSchedule): Span | undefined =>
  [...schedule.spans].reverse().find((span): span is Span => span !== null);

const union = (spans: (Span | undefined)[]): Span | undefined =>
  spans.reduce<Span | undefined>((acc, span) => {
    if (!span) {
      return acc;
    }
    return acc ? {start: Math.min(acc.start, span.start), end: Math.max(acc.end, span.end)} : {start: span.start, end: span.end};
  }, undefined);

/** Persons needed for the estimate, and the working days it was spread over. */
export type Workload = {persons?: number; workDays?: number; from?: number; to?: number; pastEnd: boolean};

/**
 * Persons needed to finish the estimate by the planned end (else the due date). A remaining
 * estimate is spread from today (or the later start); a total one over the whole planned span.
 */
export const workload = (estimate: number | undefined, window: Span | undefined, due: number | undefined, meaning: GanttConfig['estimationMeaning'], today: number): Workload => {
  const to = window?.end ?? due;
  if (estimate === undefined || estimate <= 0 || to === undefined) {
    return {pastEnd: false};
  }
  const from = meaning === 'remaining' ? Math.max(today, window?.start ?? today) : window?.start;
  if (from === undefined) {
    return {pastEnd: false};
  }
  const workDays = workDaysBetween(from, to);
  if (workDays === 0) {
    return {from, to, workDays, pastEnd: meaning === 'remaining'};
  }
  return {persons: personsNeeded(estimate, workDays), workDays, from, to, pastEnd: false};
};

export type GanttIssueRow = {
  type: 'issue';
  key: string;
  issue: BoardIssue;
  depth: number;
  parentId: string | null;
  schedule: IssueSchedule;
  /** For issues without a planned span: the span of their subtasks, drawn as a shadow. */
  derived?: Span;
  /** For subtasks with only an estimate: the parent's span they are drawn in. */
  borrowed?: Span;
  /** Whether the issue has a bar or diamond on the chart. */
  timed: boolean;
  /** Subtasks on the chart. */
  childCount: number;
  /** Subtasks with neither time nor an estimate, left off the chart. */
  undatedChildIds: string[];
  /** The subtasks without time are listed (the parent's badge is pressed). */
  showingUndated: boolean;
  collapsed: boolean;
  workload: Workload;
  /** Open and past its due date. */
  overdue: boolean;
  /** Planned to end after its due date. */
  overrun: boolean;
  /** Planned to start before, or end after, its parent's plan. */
  early: boolean;
  late: boolean;
  /** The parent's own detailed plan, when the issue is planned early or late against it. */
  parentSpan?: Span;
};

/** The group of top-level issues without time, at the bottom; parents show theirs with a badge. */
export type GanttUndatedRow = {type: 'undated'; key: string; parentId: string | null; depth: number; count: number; expanded: boolean};

export type GanttRow = GanttIssueRow | GanttUndatedRow;

/** Key of the group of top-level issues without time, in the "show issues without time" prefs. */
export const UNDATED_ROOTS_KEY = '__undated__';

/** The key that shows or hides the issues of a "without time" row: its parent's id, or the top-level group's key. */
export const undatedToggleKey = (row: GanttUndatedRow): string => row.parentId ?? UNDATED_ROOTS_KEY;

export type GanttInput = {
  issues: BoardIssue[];
  gantt: GanttConfig;
  universe: FieldUniverse;
  /** Parents whose subtasks are hidden. */
  collapsed: Set<string>;
  /** Parents (or UNDATED_ROOTS_KEY) whose issues without time are listed. */
  showUndated: Set<string>;
  now: number;
};

type Node = {
  issue: BoardIssue;
  schedule: IssueSchedule;
  own?: Span;
  derived?: Span;
  children: BoardIssue[];
};

const dueSpan = (schedule: IssueSchedule): Span | undefined => (schedule.due === undefined ? undefined : {start: schedule.due, end: schedule.due});

/** Builds the tree facts every row needs: schedules, own and derived spans, subtasks on the board. */
const buildNodes = (issues: BoardIssue[], gantt: GanttConfig, universe: FieldUniverse): Map<string, Node> => {
  const byId = new Map(issues.map(issue => [issue.id, issue]));
  const nodes = new Map<string, Node>();
  issues.forEach(issue => {
    const schedule = issueSchedule(issue, gantt, universe);
    const children = issue.childIds.filter(id => id !== issue.id && byId.has(id)).map(id => byId.get(id) as BoardIssue);
    nodes.set(issue.id, {issue, schedule, own: detailedSpan(schedule), children});
  });
  const visiting = new Set<string>();
  const done = new Set<string>();
  // A parent without its own plan spans its subtasks' plans and due dates.
  const derive = (id: string): Span | undefined => {
    const node = nodes.get(id);
    if (!node || visiting.has(id)) {
      return undefined;
    }
    if (done.has(id)) {
      return node.own ?? node.derived ?? dueSpan(node.schedule);
    }
    visiting.add(id);
    const fromChildren = union(node.children.map(child => derive(child.id)));
    visiting.delete(id);
    done.add(id);
    if (!node.own && fromChildren) {
      node.derived = fromChildren;
    }
    return node.own ?? node.derived ?? dueSpan(node.schedule);
  };
  issues.forEach(issue => derive(issue.id));
  return nodes;
};

const hasTime = (node: Node): boolean => Boolean(node.own || node.derived || node.schedule.due !== undefined);

/** Where a row sorts: its earliest planned, derived, borrowed or due day. */
const sortDay = (node: Node, borrowed: Span | undefined): number => {
  const starts = [...node.schedule.spans.map(span => span?.start), node.derived?.start, borrowed?.start, node.schedule.due].filter((v): v is number => v !== undefined);
  return starts.length > 0 ? Math.min(...starts) : Number.POSITIVE_INFINITY;
};

type Placed = {node: Node; borrowed?: Span};

const compareByTime = (a: Placed, b: Placed): number =>
  sortDay(a.node, a.borrowed) - sortDay(b.node, b.borrowed) || compareIssues(a.node.issue, b.node.issue);

type RowContext = {gantt: GanttConfig; collapsed: Set<string>; showUndated: Set<string>; today: number};

/** Facts about where an issue stands against its own plan, due date and parent. */
const timingOf = (node: Node, parent: Node | null, today: number): Pick<GanttIssueRow, 'overdue' | 'overrun' | 'early' | 'late' | 'parentSpan'> => {
  const due = node.schedule.due;
  const planEnd = (node.own ?? node.derived)?.end;
  const theirs = parent?.own;
  const own = node.own;
  const early = Boolean(theirs && own && own.start < theirs.start);
  const late = Boolean(theirs && own && own.end > theirs.end);
  return {
    overdue: due !== undefined && !node.issue.resolved && due < today,
    overrun: due !== undefined && planEnd !== undefined && planEnd > due,
    early,
    late,
    ...((early || late) && theirs ? {parentSpan: theirs} : {})
  };
};

const issueRow = (context: RowContext, placed: Placed, depth: number, parent: Node | null, timed: boolean, shown: Placed[], undated: Node[]): GanttIssueRow => {
  const {node, borrowed} = placed;
  const window = node.own ?? borrowed ?? node.derived;
  return {
    type: 'issue',
    key: node.issue.id,
    issue: node.issue,
    depth,
    parentId: parent?.issue.id ?? null,
    schedule: node.schedule,
    ...(node.derived ? {derived: node.derived} : {}),
    ...(borrowed ? {borrowed} : {}),
    timed,
    childCount: shown.length,
    undatedChildIds: undated.map(child => child.issue.id),
    showingUndated: undated.length > 0 && context.showUndated.has(node.issue.id),
    collapsed: context.collapsed.has(node.issue.id),
    workload: node.issue.resolved ? {pastEnd: false} : workload(node.schedule.estimate, window, node.schedule.due, context.gantt.estimationMeaning, context.today),
    ...timingOf(node, parent, context.today)
  };
};

/**
 * The rows of the Gantt chart, in display order: top-level issues by time, each followed by its
 * subtasks (unless collapsed) and the toggle for subtasks without time, then the top-level issues
 * without time. Subtasks with only an estimate are drawn in their parent's span.
 */
export const buildGanttRows = ({issues, gantt, universe, collapsed, showUndated, now}: GanttInput): GanttRow[] => {
  const nodes = buildNodes(issues, gantt, universe);
  const today = todayPosition(now);
  const onBoard = new Set(issues.map(issue => issue.id));
  const rows: GanttRow[] = [];
  const emitted = new Set<string>();
  const context: RowContext = {gantt, collapsed, showUndated, today};

  const visit = (placed: Placed, depth: number, parent: Node | null): void => {
    const {node, borrowed} = placed;
    if (emitted.has(node.issue.id)) {
      return;
    }
    emitted.add(node.issue.id);
    const window = node.own ?? node.derived ?? borrowed;
    const shown: Placed[] = [];
    const undated: Node[] = [];
    node.children.forEach(child => {
      const childNode = nodes.get(child.id) as Node;
      if (hasTime(childNode)) {
        shown.push({node: childNode});
      } else if (childNode.schedule.estimate !== undefined && window) {
        shown.push({node: childNode, borrowed: window});
      } else {
        undated.push(childNode);
      }
    });
    shown.sort(compareByTime);
    undated.sort((a, b) => compareIssues(a.issue, b.issue));
    rows.push(issueRow(context, placed, depth, parent, true, shown, undated));
    if (collapsed.has(node.issue.id)) {
      return;
    }
    shown.forEach(child => visit(child, depth + 1, node));
    // Subtasks without time are listed after the others when the parent's badge shows them.
    if (undated.length > 0 && showUndated.has(node.issue.id)) {
      undated.forEach(child => {
        emitted.add(child.issue.id);
        rows.push(issueRow(context, {node: child}, depth + 1, node, false, [], []));
      });
    }
  };

  const roots = issues.filter(issue => !issue.parentIds.some(id => onBoard.has(id) && id !== issue.id)).map(issue => nodes.get(issue.id) as Node);
  const timedRoots = roots.filter(hasTime).map(node => ({node})).sort(compareByTime);
  const undatedRoots = roots.filter(node => !hasTime(node)).sort((a, b) => compareIssues(a.issue, b.issue));
  timedRoots.forEach(root => visit(root, 0, null));
  if (undatedRoots.length > 0) {
    const expanded = showUndated.has(UNDATED_ROOTS_KEY);
    rows.push({type: 'undated', key: UNDATED_ROOTS_KEY, parentId: null, depth: 0, count: undatedRoots.length, expanded});
    if (expanded) {
      undatedRoots.forEach(node => {
        emitted.add(node.issue.id);
        rows.push(issueRow(context, {node}, 0, null, false, [], []));
      });
    }
  }
  return rows;
};

/** Every span a row draws, high-level plans first. */
export const rowSpans = (row: GanttIssueRow): Span[] =>
  [...row.schedule.spans, row.derived, row.borrowed, row.schedule.due === undefined ? undefined : {start: row.schedule.due, end: row.schedule.due}]
    .filter((span): span is Span => Boolean(span));

/** Days the chart shows: every drawn span and today, with some room around. */
/** How far from today the chart reaches at most, either way: plans beyond it are cut at its edge. */
export const RANGE_YEARS = 10;
const DAYS_PER_YEAR = 366;

export const ganttRange = (rows: GanttRow[], now: number, padDays: number): {start: number; end: number} => {
  const today = todayPosition(now);
  let start = today;
  let end = today;
  rows.forEach(row => {
    if (row.type === 'issue' && row.timed) {
      rowSpans(row).forEach(span => {
        start = Math.min(start, span.start);
        end = Math.max(end, span.end);
      });
    }
  });
  // A mistyped year (0026, 2206) would stretch the chart over centuries: keep to years around today.
  const reach = RANGE_YEARS * DAYS_PER_YEAR * MS_PER_DAY;
  start = Math.max(start, today - reach);
  end = Math.min(end, today + reach);
  return {start: start - padDays * MS_PER_DAY, end: end + padDays * MS_PER_DAY};
};

/**
 * Relation arrows between issues drawn on the chart; subtask links are drawn as the tree instead.
 * Directed links read the Gantt way, from the issue needed to the one that needs it: "B is
 * required for A" rather than the other layouts' "A depends on B".
 */
export const ganttEdges = (rows: GanttRow[], linkTypes: string[]): Edge[] => {
  const shown = rows.filter((row): row is GanttIssueRow => row.type === 'issue' && row.timed);
  const ids = new Set(shown.map(row => row.issue.id));
  return computeEdges(shown.map(row => row.issue), ids, linkTypes.filter(type => type !== SUBTASK_LINK_TYPE))
    .map(edge => (edge.kind === 'undirected' ? edge : {...edge, from: edge.to, to: edge.from, label: edge.inverseLabel || edge.label}));
};

/** What hides an issue on the chart: collapsed ancestors, and the "without time" group it is in. */
export type Reveal = {expand: string[]; showUndated: string | null};

/**
 * What to expand to show an issue: its ancestors on the chart, and, for an issue without time,
 * the "without time" group of its parent (or of the top level). Null when it is not on the chart.
 */
/** The rows with every parent expanded and every "without time" group listed. */
const expandedRows = (input: Omit<GanttInput, 'collapsed' | 'showUndated'>): GanttRow[] =>
  buildGanttRows({...input, collapsed: new Set(), showUndated: new Set([UNDATED_ROOTS_KEY, ...input.issues.map(issue => issue.id)])});

/** The issues in the order the chart lists them with everything expanded: the order find steps through. */
export const findOrder = (input: Omit<GanttInput, 'collapsed' | 'showUndated'>): string[] =>
  expandedRows(input).flatMap(row => (row.type === 'issue' ? [row.issue.id] : []));

export const revealFor = (input: Omit<GanttInput, 'collapsed' | 'showUndated'>, issueId: string): Reveal | null => {
  const rows = expandedRows(input);
  const byId = new Map(rows.flatMap(row => (row.type === 'issue' ? [[row.issue.id, row] as const] : [])));
  const row = byId.get(issueId);
  if (!row) {
    return null;
  }
  const expand: string[] = [];
  for (let parent = row.parentId; parent !== null && !expand.includes(parent); parent = byId.get(parent)?.parentId ?? null) {
    expand.push(parent);
  }
  return {expand, showUndated: row.timed ? null : (row.parentId ?? UNDATED_ROOTS_KEY)};
};

/**
 * The plan with only the planning levels the user shows: the Gantt chart then works as if the
 * board had just those. At least one level always stays; unknown ids are ignored.
 */
export const visibleGantt = (gantt: GanttConfig, hiddenIds: string[]): GanttConfig => {
  const levels = gantt.levels.filter(level => !hiddenIds.includes(level.id));
  return levels.length === gantt.levels.length || levels.length === 0 ? gantt : {...gantt, levels};
};
