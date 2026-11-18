import {describe, expect, it} from 'vitest';
import {type BoardConfig, type PlanLevel, ROWS_BY_DUE, type TimelineConfig, createEmptyBoard, emptyGantt, emptyTimeline, rowsByLevel} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {issueTime, timeMeaning, timePreset, timeRowChange, timingFlags, timingNotes, todayPosition} from './timeline';

const d = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);

const plain = (name: string, typeId: string): YtProjectCustomField => ({id: `pf-${name}`, $type: 'X', field: {id: name, name, fieldType: {id: typeId, valueType: typeId}}});
const versions: YtProjectCustomField = {
  ...plain('Fix versions', 'version[*]'),
  bundle: {id: 'b', $type: 'VersionBundle', values: [
    {id: '1', name: '1.0', startDate: d('2026-01-01'), releaseDate: d('2026-02-01')},
    {id: '2', name: '2.0', startDate: d('2026-03-01'), releaseDate: d('2026-04-01')},
    {id: '3', name: 'next'}
  ]}
};
const universe = buildFieldUniverse([[plain('Due Date', 'date'), plain('Estimation', 'period'), plain('Assignee', 'user[1]'), versions]]);

const issue = (id: string, fields: BoardIssue['fields'], extra: Partial<BoardIssue> = {}): BoardIssue => ({
  id, idReadable: `SAN-${id}`, summary: '', projectId: 'p', projectShortName: 'SAN', number: Number(id), tags: [], links: [], parentIds: [], childIds: [], fields, ...extra
});
const date = (time: number) => ({$type: 'DateIssueCustomField', key: String(time), label: String(time), labels: [String(time)], keys: [String(time)]});
const period = (minutes: number) => ({$type: 'PeriodIssueCustomField', key: `${minutes}m`, label: `${minutes}m`, labels: [`${minutes}m`], keys: [`${minutes}m`], minutes});
const multi = (keys: string[]) => ({$type: 'MultiVersionIssueCustomField', key: keys[0], label: keys[0], labels: keys, keys});
const user = {$type: 'SingleUserIssueCustomField', key: 'ann', label: 'Ann', labels: ['Ann'], keys: ['ann']};

const level = (changes: Partial<PlanLevel>): PlanLevel => ({id: 'l', name: 'Plan', source: 'date', field: {name: 'Due Date', kind: 'date'}, endField: null, periodField: null, dateRole: 'end', ...changes});

/** A board whose time rows are placed by `placing` (a level, or the due date). */
const board = (placing: PlanLevel | 'due', timeline: Partial<TimelineConfig> = {}): BoardConfig => {
  const base = createEmptyBoard('me');
  const levels = placing === 'due' ? [] : [placing];
  return {
    ...base,
    gantt: {...emptyGantt(), levels, dueField: {name: 'Due Date', kind: 'date'}},
    timeline: {...emptyTimeline(), enabled: true, rowsBy: placing === 'due' ? ROWS_BY_DUE : rowsByLevel(placing.id), ...timeline}
  };
};

describe('issueTime', () => {
  it('places by a date, a date made a range by a period, or the due date', () => {
    const due = issue('1', {'Due Date': date(d('2026-05-15')), 'Estimation': period(2 * 8 * 60)});
    expect(issueTime(due, board(level({})), universe)).toEqual({start: Date.UTC(2026, 4, 15), end: Date.UTC(2026, 4, 15), at: Date.UTC(2026, 4, 15)});
    const ranged = level({source: 'date-period', periodField: {name: 'Estimation', kind: 'period'}});
    // Two working days ending Friday 15 May: Thursday 14 May to Friday.
    expect(issueTime(due, board(ranged, {position: 'start'}), universe)).toMatchObject({start: Date.UTC(2026, 4, 14), end: Date.UTC(2026, 4, 15), at: Date.UTC(2026, 4, 14)});
    expect(issueTime(due, board('due'), universe)).toMatchObject({at: Date.UTC(2026, 4, 15)});
    expect(issueTime(issue('2', {'Due Date': null}), board(level({})), universe)).toEqual({});
  });

  it('spans multi-value versions from the earliest start to the latest release, naming them', () => {
    const fix = level({source: 'version', field: {name: 'Fix versions', kind: 'version'}});
    const time = issueTime(issue('1', {'Fix versions': multi(['2.0', '1.0', 'next'])}), board(fix, {position: 'start'}), universe);
    expect(time).toEqual({start: Date.UTC(2026, 0, 1), startLabel: '1.0', end: Date.UTC(2026, 3, 1), endLabel: '2.0', at: Date.UTC(2026, 0, 1), atLabel: '1.0'});
  });

  it('falls back to another level when the placing one is gone', () => {
    const config = {...board(level({})), timeline: {...emptyTimeline(), enabled: true, rowsBy: rowsByLevel('gone')}};
    expect(timeMeaning(config)).toBe('end');
    expect(issueTime(issue('1', {'Due Date': date(d('2026-05-15'))}), config, universe).at).toBe(Date.UTC(2026, 4, 15));
  });
});

describe('time positions', () => {
  it('takes today as the local calendar date', () => {
    expect(todayPosition(new Date(2026, 4, 10, 15, 30).getTime())).toBe(Date.UTC(2026, 4, 10));
  });
});

describe('timingFlags', () => {
  const now = new Date(2026, 4, 10, 9, 0).getTime();
  const ctx = (config: BoardConfig) => ({config, universe, now});

  it('flags unresolved issues past their end date, and those without an assignee too', () => {
    const late = issue('1', {'Due Date': date(d('2026-05-09')), 'Assignee': user});
    expect(timingFlags(late, undefined, ctx(board(level({}))))).toEqual(['overdue']);
    expect(timingFlags({...late, fields: {...late.fields, Assignee: null}}, undefined, ctx(board(level({}))))).toEqual(['overdue', 'overdue-unassigned']);
    expect(timingFlags({...late, resolved: true}, undefined, ctx(board(level({}))))).toEqual([]);
    expect(timingFlags(issue('2', {'Due Date': date(d('2026-05-10'))}), undefined, ctx(board(level({}))))).toEqual([]);
  });

  it('flags subtasks ending after or starting before their parent', () => {
    const parent = issue('9', {'Due Date': date(d('2026-06-01'))});
    const child = issue('1', {'Due Date': date(d('2026-06-05')), 'Assignee': user});
    expect(timingFlags(child, parent, ctx(board(level({}))))).toEqual(['planned-late']);
    const early = issue('2', {'Due Date': date(d('2026-05-20')), 'Assignee': user});
    expect(timingFlags(early, parent, ctx(board(level({}), {position: 'start'})))).toEqual(['planned-early']);
  });

  it('flags unassigned issues that should have started but are not yet overdue, and nothing when highlights are off', () => {
    // Four working weeks ending 20 May: started in April, not yet due.
    const ranged = level({source: 'date-period', periodField: {name: 'Estimation', kind: 'period'}});
    const noDue = (config: BoardConfig): BoardConfig => ({...config, gantt: {...config.gantt, dueField: null}});
    const waiting = issue('1', {'Due Date': date(d('2026-05-20')), 'Estimation': period(20 * 8 * 60)});
    expect(timingFlags(waiting, undefined, ctx(noDue(board(ranged, {position: 'start'}))))).toEqual(['late-start']);
    expect(timingFlags(waiting, undefined, ctx(noDue(board(ranged, {highlights: false}))))).toEqual([]);
    const overdue = issue('2', {'Due Date': date(d('2026-05-01'))});
    expect(timingFlags(overdue, undefined, ctx(board(level({}), {position: 'start'})))).toEqual(['overdue', 'overdue-unassigned']);
  });
});

describe('timingNotes', () => {
  it('explains each icon, with one overdue icon whether or not unassigned', () => {
    const notes = timingNotes(['overdue', 'overdue-unassigned', 'planned-late'], {start: 1, end: 2}, time => `day ${time}`);
    expect(notes).toEqual([
      {icon: 'overdue', text: 'Overdue and unassigned: ended day 2 and not resolved'},
      {icon: 'planned-late', text: 'Ends after its parent’s plan'}
    ]);
    expect(timingNotes(['overdue'], {start: 1, end: 2, due: 3}, time => `day ${time}`)).toEqual([
      {icon: 'overdue', text: 'Overdue: due day 3 and not resolved'}
    ]);
  });
});

describe('timePreset and timeRowChange', () => {
  it('give the date, version or build that puts an issue in a time row', () => {
    const row = {time: Date.UTC(2026, 4, 10), day: Date.UTC(2026, 4, 10)};
    expect(timePreset(row, board(level({})))).toEqual({field: 'Due Date', value: '2026-05-10'});
    const fix = level({source: 'version', field: {name: 'Fix versions', kind: 'version'}});
    expect(timePreset({time: d('2026-04-01'), timeNames: ['2.0']}, board(fix))).toEqual({field: 'Fix versions', value: '2.0'});
    expect(timePreset({time: null}, board(level({})))).toBeNull();
    expect(timeRowChange(board(level({})), {time: 0}, row)).toEqual({field: {name: 'Due Date', kind: 'date'}, valueKey: String(Date.UTC(2026, 4, 10, 12))});
    expect(timeRowChange(board(fix), {time: 0, timeNames: ['1.0']}, {time: 1, timeNames: ['2.0']})).toEqual({field: {name: 'Fix versions', kind: 'version'}, valueKey: '2.0', replaceKey: '1.0'});
  });

  it('have nothing to set when the placing end comes from a period', () => {
    const ranged = level({source: 'date-period', periodField: {name: 'Estimation', kind: 'period'}, dateRole: 'start'});
    expect(timePreset({time: d('2026-05-10')}, board(ranged, {position: 'end'}))).toBeNull();
    expect(timeRowChange(board(ranged, {position: 'end'}), {time: 0}, {time: 1})).toBeNull();
    expect(timePreset({time: Date.UTC(2026, 4, 10)}, board(ranged, {position: 'start'}))).toEqual({field: 'Due Date', value: '2026-05-10'});
  });
});
