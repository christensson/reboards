import {describe, expect, it} from 'vitest';
import {type TimelineConfig, emptyTimeline} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {hasTimeOfDay, issueTime, timePosition, timePreset, timingFlags, timingNotes, todayPosition} from './timeline';

const DAY = 86_400_000;
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

const timeline = (changes: Partial<TimelineConfig>): TimelineConfig => ({...emptyTimeline(), field: {name: 'Due Date', kind: 'date'}, ...changes});

describe('issueTime', () => {
  it('uses a date, made a range by a period from the start or back from the end', () => {
    const due = issue('1', {'Due Date': date(d('2026-05-10')), 'Estimation': period(2 * 24 * 60)});
    expect(issueTime(due, timeline({}), universe)).toEqual({start: d('2026-05-10'), end: d('2026-05-10'), at: d('2026-05-10')});
    const ranged = timeline({periodField: {name: 'Estimation', kind: 'period'}});
    expect(issueTime(due, ranged, universe)).toMatchObject({start: d('2026-05-10') - 2 * DAY, end: d('2026-05-10'), at: d('2026-05-10')});
    expect(issueTime(due, {...ranged, dateRole: 'start', position: 'start'}, universe)).toMatchObject({start: d('2026-05-10'), end: d('2026-05-12'), at: d('2026-05-10')});
    expect(issueTime(issue('2', {'Due Date': null}), timeline({}), universe)).toEqual({});
  });

  it('spans multi-value versions from the earliest start to the latest release, naming them', () => {
    const fix = timeline({field: {name: 'Fix versions', kind: 'version'}, position: 'start'});
    const time = issueTime(issue('1', {'Fix versions': multi(['2.0', '1.0', 'next'])}), fix, universe);
    expect(time).toEqual({start: d('2026-01-01'), startLabel: '1.0', end: d('2026-04-01'), endLabel: '2.0', at: d('2026-01-01'), atLabel: '1.0'});
  });
});

describe('time positions', () => {
  it('compares calendar dates by day and exact times as they are', () => {
    expect(timePosition(d('2026-05-10'), false)).toBe(Date.UTC(2026, 4, 10));
    expect(timePosition(d('2026-05-10'), true)).toBe(d('2026-05-10'));
    const now = new Date(2026, 4, 10, 15, 30).getTime();
    expect(todayPosition(now)).toBe(Date.UTC(2026, 4, 10));
    expect(hasTimeOfDay(new Date(2026, 4, 10).getTime())).toBe(false);
    expect(hasTimeOfDay(now)).toBe(true);
  });
});

describe('timingFlags', () => {
  const now = new Date(2026, 4, 10, 9, 0).getTime();
  const ctx = (changes: Partial<TimelineConfig>) => ({timeline: timeline(changes), universe, now});

  it('flags unresolved issues past their end date, and those without an assignee too', () => {
    const late = issue('1', {'Due Date': date(d('2026-05-09')), 'Assignee': user});
    expect(timingFlags(late, undefined, ctx({}))).toEqual(['overdue']);
    expect(timingFlags({...late, fields: {...late.fields, Assignee: null}}, undefined, ctx({}))).toEqual(['overdue', 'overdue-unassigned']);
    expect(timingFlags({...late, resolved: true}, undefined, ctx({}))).toEqual([]);
    expect(timingFlags(issue('2', {'Due Date': date(d('2026-05-10'))}), undefined, ctx({}))).toEqual([]);
  });

  it('flags subtasks ending after or starting before their parent', () => {
    const parent = issue('9', {'Due Date': date(d('2026-06-01'))});
    const child = issue('1', {'Due Date': date(d('2026-06-05')), 'Assignee': user});
    expect(timingFlags(child, parent, ctx({}))).toEqual(['planned-late']);
    const early = issue('2', {'Due Date': date(d('2026-05-20')), 'Assignee': user});
    expect(timingFlags(early, parent, ctx({dateRole: 'start'}))).toEqual(['planned-early']);
  });

  it('flags unassigned issues that should have started, and nothing when highlights are off', () => {
    const waiting = issue('1', {'Due Date': date(d('2026-05-01'))});
    expect(timingFlags(waiting, undefined, ctx({dateRole: 'start'}))).toEqual(['late-start']);
    expect(timingFlags(waiting, undefined, ctx({highlights: false}))).toEqual([]);
  });
});

describe('timingNotes', () => {
  it('explains each icon, with one overdue icon whether or not unassigned', () => {
    const notes = timingNotes(['overdue', 'overdue-unassigned', 'planned-late'], {start: 1, end: 2}, time => `day ${time}`);
    expect(notes).toEqual([
      {icon: 'overdue', text: 'Overdue and unassigned: ended day 2 and is not resolved'},
      {icon: 'planned-late', text: 'Planned late: ends day 2, after its parent ends'}
    ]);
  });
});

describe('timePreset', () => {
  it('gives the date, version or build that puts a new issue in a time row', () => {
    expect(timePreset({time: Date.UTC(2026, 4, 10), day: Date.UTC(2026, 4, 10)}, timeline({}), universe)).toEqual({field: 'Due Date', value: '2026-05-10'});
    const fix = timeline({field: {name: 'Fix versions', kind: 'version'}});
    expect(timePreset({time: d('2026-04-01'), timeNames: ['2.0']}, fix, universe)).toEqual({field: 'Fix versions', value: '2.0'});
    expect(timePreset({time: null}, timeline({}), universe)).toBeNull();
    // The row is the end of "start date + estimation": no single date to set.
    const ranged = timeline({periodField: {name: 'Estimation', kind: 'period'}, dateRole: 'start', position: 'end'});
    expect(timePreset({time: d('2026-05-10')}, ranged, universe)).toBeNull();
  });
});
