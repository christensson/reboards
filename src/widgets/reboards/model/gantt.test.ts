import {describe, expect, it} from 'vitest';
import {type GanttConfig, type PlanLevel, emptyGantt} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import {type GanttIssueRow, type GanttRow, UNDATED_ROOTS_KEY, buildGanttRows, ganttEdges, ganttRange, issueSchedule, levelSpan, revealFor, undatedToggleKey, visibleGantt, workload} from './gantt';
import type {BoardIssue, IssueLink} from './issue';
import {fitPxPerDay, ganttScale, tierFor} from './ganttScale';

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const noon = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);
const plain = (name: string, typeId: string): YtProjectCustomField => ({id: `pf-${name}`, $type: 'X', field: {id: name, name, fieldType: {id: typeId, valueType: typeId}}});
const sprints: YtProjectCustomField = {
  ...plain('Sprints', 'version[*]'),
  bundle: {id: 'b', $type: 'VersionBundle', values: [
    {id: '1', name: 'S1', startDate: noon('2026-11-02'), releaseDate: noon('2026-11-13')},
    {id: '2', name: 'S2', startDate: noon('2026-11-16'), releaseDate: noon('2026-11-27')},
    {id: '3', name: 'Backlog'}
  ]}
};
const universe = buildFieldUniverse([[plain('Start', 'date'), plain('End', 'date'), plain('Due', 'date'), plain('Estimation', 'period'), sprints]]);

const value = (key: string, minutes?: number) => ({$type: 'X', key, label: key, labels: [key], keys: [key], ...(minutes === undefined ? {} : {minutes})});
const date = (iso: string) => value(String(noon(iso)));
const multi = (keys: string[]) => ({$type: 'MultiVersionIssueCustomField', key: keys[0], label: keys[0], labels: keys, keys});
const issue = (id: string, fields: BoardIssue['fields'], extra: Partial<BoardIssue> = {}): BoardIssue => ({
  id, idReadable: `SAN-${id}`, summary: '', projectId: 'p', projectShortName: 'SAN', number: Number(id), tags: [], links: [], parentIds: [], childIds: [], fields, ...extra
});

const dates: PlanLevel = {id: 'l1', name: 'Roadmap', source: 'dates', field: {name: 'Start', kind: 'date'}, endField: {name: 'End', kind: 'date'}, periodField: null, dateRole: 'start'};
const sprint: PlanLevel = {id: 'l2', name: 'Sprint', source: 'version', field: {name: 'Sprints', kind: 'version'}, endField: null, periodField: null, dateRole: 'start'};
const period: PlanLevel = {id: 'l3', name: 'Work', source: 'date-period', field: {name: 'Due', kind: 'date'}, endField: null, periodField: {name: 'Estimation', kind: 'period'}, dateRole: 'end'};
const gantt = (changes: Partial<GanttConfig> = {}): GanttConfig => ({
  ...emptyGantt(),
  levels: [dates, sprint],
  dueField: {name: 'Due', kind: 'date'},
  estimationField: {name: 'Estimation', kind: 'period'},
  ...changes
});
const NOW = new Date(2026, 10, 17, 10).getTime(); // Tuesday 17 Nov 2026

const rows = (issues: BoardIssue[], config = gantt(), options: {collapsed?: string[]; showUndated?: string[]} = {}): GanttRow[] =>
  buildGanttRows({issues, gantt: config, universe, collapsed: new Set(options.collapsed), showUndated: new Set(options.showUndated), now: NOW});
const issueRows = (list: GanttRow[]): GanttIssueRow[] => list.filter((row): row is GanttIssueRow => row.type === 'issue');
const keys = (list: GanttRow[]): string[] => list.map(row => row.key);

describe('levelSpan', () => {
  it('spans versions from the earliest start to the latest release', () => {
    expect(levelSpan(issue('1', {Sprints: multi(['S2', 'S1', 'Backlog'])}), sprint, universe))
      .toEqual({start: day('2026-11-02'), end: day('2026-11-27'), startLabel: 'S1', endLabel: 'S2'});
    expect(levelSpan(issue('1', {Sprints: multi(['Backlog'])}), sprint, universe)).toBeNull();
  });

  it('uses two dates, either of which may stand alone', () => {
    expect(levelSpan(issue('1', {Start: date('2026-11-02'), End: date('2026-11-10')}), dates, universe)).toEqual({start: day('2026-11-02'), end: day('2026-11-10')});
    expect(levelSpan(issue('1', {End: date('2026-11-10')}), dates, universe)).toEqual({start: day('2026-11-10'), end: day('2026-11-10')});
    expect(levelSpan(issue('1', {}), dates, universe)).toBeNull();
  });

  it('runs a period in working days forward from a start or back from an end', () => {
    const fields = {Due: date('2026-11-20'), Estimation: value('1w', 2400)};
    expect(levelSpan(issue('1', fields), period, universe)).toEqual({start: day('2026-11-16'), end: day('2026-11-20')});
    expect(levelSpan(issue('1', fields), {...period, dateRole: 'start'}, universe)).toEqual({start: day('2026-11-20'), end: day('2026-11-26')});
    expect(levelSpan(issue('1', {Due: date('2026-11-20')}), period, universe)).toEqual({start: day('2026-11-20'), end: day('2026-11-20')});
  });

  it('ignores incomplete levels', () => {
    expect(levelSpan(issue('1', {Start: date('2026-11-02')}), {...dates, endField: null}, universe)).toBeNull();
  });
});

describe('issueSchedule', () => {
  it('collects every level, the due day and the estimate', () => {
    const schedule = issueSchedule(issue('1', {Start: date('2026-11-02'), End: date('2026-11-30'), Due: date('2026-12-01'), Estimation: value('2d', 960)}), gantt(), universe);
    expect(schedule).toEqual({spans: [{start: day('2026-11-02'), end: day('2026-11-30')}, null], due: day('2026-12-01'), dueTime: noon('2026-12-01'), estimate: 16});
  });
});

describe('workload', () => {
  const today = day('2026-11-17');
  const window = {start: day('2026-11-16'), end: day('2026-11-27')};
  it('spreads a remaining estimate from today', () => {
    expect(workload(72, window, undefined, 'remaining', today)).toMatchObject({persons: 1, workDays: 9, from: today});
  });
  it('spreads a total estimate over the whole plan', () => {
    expect(workload(80, window, undefined, 'total', today)).toMatchObject({persons: 1, workDays: 10, from: day('2026-11-16')});
    expect(workload(80, undefined, day('2026-11-27'), 'total', today)).toEqual({pastEnd: false});
  });
  it('falls back to the due date and flags work past its end', () => {
    expect(workload(8, undefined, day('2026-11-18'), 'remaining', today)).toMatchObject({persons: 0.5, workDays: 2});
    expect(workload(8, {start: day('2026-11-02'), end: day('2026-11-13')}, undefined, 'remaining', today)).toMatchObject({pastEnd: true});
    expect(workload(undefined, window, undefined, 'remaining', today)).toEqual({pastEnd: false});
  });
});

describe('buildGanttRows', () => {
  const epic = issue('1', {}, {childIds: ['2', '3', '4', '5']});
  const story = issue('2', {Sprints: multi(['S2'])}, {parentIds: ['1']});
  const early = issue('3', {Sprints: multi(['S1'])}, {parentIds: ['1']});
  const estimateOnly = issue('4', {Estimation: value('1d', 480)}, {parentIds: ['1']});
  const undated = issue('5', {}, {parentIds: ['1']});
  const loose = issue('6', {});
  const dueOnly = issue('7', {Due: date('2026-10-30')});

  it('orders by time, nests subtasks and lists issues without time last', () => {
    expect(keys(rows([epic, story, early, estimateOnly, undated, loose, dueOnly]))).toEqual(['7', '1', '3', '4', '2', UNDATED_ROOTS_KEY]);
  });

  it('derives a parent span from its subtasks and lends it to estimate-only subtasks', () => {
    const list = issueRows(rows([epic, story, early, estimateOnly, undated]));
    const parent = list.find(row => row.key === '1');
    expect(parent?.derived).toEqual({start: day('2026-11-02'), end: day('2026-11-27')});
    expect(parent?.undatedChildIds).toEqual(['5']);
    expect(parent?.childCount).toBe(3);
    expect(list.find(row => row.key === '4')?.borrowed).toEqual(parent?.derived);
    expect(list.find(row => row.key === '4')?.workload.persons).toBeCloseTo(8 / (9 * 8));
  });

  it('lists subtasks without time from the parent\'s badge, and keeps only the top-level group as a row', () => {
    const list = rows([epic, story, early, estimateOnly, undated, loose]);
    const groups = list.filter((row): row is Extract<GanttRow, {type: 'undated'}> => row.type === 'undated');
    expect(groups.map(undatedToggleKey)).toEqual([UNDATED_ROOTS_KEY]);
    expect(issueRows(list).find(row => row.key === '1')).toMatchObject({undatedChildIds: ['5'], showingUndated: false});
    const shown = rows([epic, story, early, estimateOnly, undated, loose], gantt(), {showUndated: ['1']});
    expect(keys(shown)).toContain('5');
    expect(issueRows(shown).find(row => row.key === '1')?.showingUndated).toBe(true);
  });

  it('collapses parents and expands issues without time', () => {
    expect(keys(rows([epic, story, early, estimateOnly, undated], gantt(), {collapsed: ['1']}))).toEqual(['1']);
    const shown = rows([epic, story, early, estimateOnly, undated, loose], gantt(), {showUndated: ['1', UNDATED_ROOTS_KEY]});
    expect(keys(shown)).toEqual(['1', '3', '4', '2', '5', UNDATED_ROOTS_KEY, '6']);
    expect(issueRows(shown).find(row => row.key === '5')?.timed).toBe(false);
  });

  it('flags subtasks planned outside their parent, overdue and overrun issues', () => {
    const parent = issue('1', {Sprints: multi(['S2'])}, {childIds: ['2']});
    const child = issue('2', {Sprints: multi(['S1', 'S2']), Due: date('2026-11-13')}, {parentIds: ['1']});
    const list = issueRows(rows([parent, child]));
    const row = list.find(r => r.key === '2');
    expect(row).toMatchObject({early: true, late: false, overdue: true, overrun: true});
    expect(issueRows(rows([{...child, resolved: true, parentIds: []}]))[0].overdue).toBe(false);
  });

  it('survives subtask cycles', () => {
    const a = issue('1', {Due: date('2026-11-20')}, {childIds: ['2'], parentIds: ['2']});
    const b = issue('2', {Due: date('2026-11-21')}, {childIds: ['1'], parentIds: ['1']});
    expect(() => rows([a, b])).not.toThrow();
  });
});

describe('chart helpers', () => {
  it('covers every span and today', () => {
    const list = rows([issue('1', {Start: date('2026-12-01'), End: date('2026-12-20')})]);
    expect(ganttRange(list, NOW, 0)).toEqual({start: day('2026-11-17'), end: day('2026-12-20')});
  });

  it('draws relation arrows between issues on the chart only, from the issue needed to the one that needs it', () => {
    const link = (ids: string[], direction: IssueLink['direction']): IssueLink => ({
      typeId: 'dep', typeName: 'Depend', sourceToTarget: 'is required for', targetToSource: 'depends on', directed: true, aggregation: false, direction, issueIds: ids
    });
    const a = issue('1', {Due: date('2026-11-20')}, {links: [link(['2', '3'], 'INWARD')]});
    const b = issue('2', {Due: date('2026-11-25')}, {links: [link(['1'], 'OUTWARD')]});
    const c = issue('3', {}, {links: [link(['1'], 'OUTWARD')]});
    const edges = ganttEdges(rows([a, b, c]), ['Subtask', 'Depend']);
    expect(edges.map(edge => [edge.from, edge.to, edge.label])).toEqual([['2', '1', 'is required for']]);
  });

  it('builds a two-tier scale', () => {
    const scale = ganttScale({start: day('2026-11-30'), end: day('2026-12-06')}, 32);
    expect(scale.bottom).toHaveLength(7);
    expect(scale.top).toHaveLength(2);
    expect(scale.width).toBe(7 * 32);
    const quarters = ganttScale({start: day('2026-11-01'), end: day('2027-02-01')}, 1.5);
    expect(quarters.bottom.map(tick => tick.label)).toEqual(['Q4', 'Q1']);
    expect(quarters.top.map(tick => tick.label)).toEqual(['2026', '2027']);
  });

  it('picks the ticks by day width, and fits a range with its padding', () => {
    expect([40, 20, 10, 3, 1].map(tierFor)).toEqual(['day', 'day', 'week', 'month', 'quarter']);
    // 100 days in 1,000 pixels: 10 px per day shows weeks, padded by 7 days at both ends.
    expect(fitPxPerDay(100, 1000)).toBeCloseTo(1000 / 114);
    expect(fitPxPerDay(100_000, 1000)).toBe(0.4);
  });
});

describe('revealFor', () => {
  const epic = issue('1', {}, {childIds: ['2', '5']});
  const story = issue('2', {Sprints: multi(['S2'])}, {parentIds: ['1'], childIds: ['3']});
  const task = issue('3', {Due: date('2026-11-20')}, {parentIds: ['2']});
  const untimed = issue('5', {}, {parentIds: ['1']});
  const loose = issue('6', {});
  const input = {issues: [epic, story, task, untimed, loose], gantt: gantt(), universe, now: NOW};

  it('expands the ancestors of a nested subtask', () => {
    expect(revealFor(input, '3')).toEqual({expand: ['2', '1'], showUndated: null});
  });

  it('lists the issues without time an issue is among', () => {
    expect(revealFor(input, '5')).toEqual({expand: ['1'], showUndated: '1'});
    expect(revealFor(input, '6')).toEqual({expand: [], showUndated: UNDATED_ROOTS_KEY});
    expect(revealFor(input, 'missing')).toBeNull();
  });
});

describe('visibleGantt', () => {
  it('keeps the shown levels, never none, ignoring unknown ids', () => {
    expect(visibleGantt(gantt(), ['l1']).levels.map(level => level.id)).toEqual(['l2']);
    expect(visibleGantt(gantt(), ['l1', 'l2']).levels.map(level => level.id)).toEqual(['l1', 'l2']);
    expect(visibleGantt(gantt(), ['gone'])).toEqual(gantt());
  });

  it('makes the next level the detailed bar when the finest is hidden', () => {
    const planned = issue('1', {Start: date('2026-11-16'), End: date('2026-11-27'), Sprints: multi(['S1']), Estimation: value('2d', 960)});
    const shown = issueRows(buildGanttRows({issues: [planned], gantt: visibleGantt(gantt(), ['l2']), universe, collapsed: new Set(), showUndated: new Set(), now: NOW}));
    expect(shown[0].schedule.spans).toEqual([{start: day('2026-11-16'), end: day('2026-11-27')}]);
    // Two days of work from today (Tue 17 Nov) to Fri 27 Nov: 9 working days.
    expect(shown[0].workload.persons).toBeCloseTo(16 / (9 * 8));
  });
});
