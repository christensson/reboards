import {describe, expect, it} from 'vitest';
import type {PlanLevel} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import {draggedSpan, drawnSpan, dueEdit, editedIssue, estimateSpan, fieldUpdates, levelHandles, missingLevels, planEdit, snapToSprints, sprintAt, sprintsOf} from './ganttEdit';
import type {BoardIssue} from './issue';

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const noon = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);
const plain = (name: string, typeId: string): YtProjectCustomField => ({id: `pf-${name}`, $type: 'X', field: {id: name, name, fieldType: {id: typeId, valueType: typeId}}});
const sprintField = (name: string, typeId: string): YtProjectCustomField => ({
  ...plain(name, typeId),
  bundle: {id: 'b', $type: 'VersionBundle', values: [
    {id: '1', name: 'S1', startDate: noon('2026-11-02'), releaseDate: noon('2026-11-13')},
    {id: '2', name: 'S2', startDate: noon('2026-11-16'), releaseDate: noon('2026-11-27')},
    {id: '3', name: 'S3', startDate: noon('2026-11-30'), releaseDate: noon('2026-12-11')},
    {id: '4', name: 'Old', startDate: noon('2026-10-19'), releaseDate: noon('2026-10-30'), archived: true},
    {id: '5', name: 'Backlog'}
  ]}
});
const universe = buildFieldUniverse([[plain('Start', 'date'), plain('End', 'date'), plain('Due', 'date and time'), plain('Estimation', 'period'),
  plain('Type', 'enum[1]'), sprintField('Sprints', 'version[*]'), sprintField('Sprint', 'version[1]')]]);
const value = (key: string, minutes?: number) => ({$type: 'T', key, label: key, labels: [key], keys: [key], ...(minutes === undefined ? {} : {minutes})});
const multi = (keys: string[]) => ({$type: 'MultiVersionIssueCustomField', key: keys[0], label: keys[0], labels: keys, keys});
const issue = (fields: BoardIssue['fields']): BoardIssue => ({
  id: '1', idReadable: 'SAN-1', summary: '', projectId: 'p', projectShortName: 'SAN', number: 1, tags: [], links: [], parentIds: [], childIds: [], fields
});
const format = (time: number) => new Date(time).toISOString().slice(5, 10);

const dates: PlanLevel = {id: 'a', name: 'Roadmap', source: 'dates', field: {name: 'Start', kind: 'date'}, endField: {name: 'End', kind: 'date'}, periodField: null, dateRole: 'start'};
const period: PlanLevel = {id: 'b', name: 'Work', source: 'date-period', field: {name: 'Start', kind: 'date'}, endField: null, periodField: {name: 'Estimation', kind: 'period'}, dateRole: 'start'};
const versions: PlanLevel = {id: 'c', name: 'Sprint', source: 'version', field: {name: 'Sprints', kind: 'version'}, endField: null, periodField: null, dateRole: 'start'};

describe('levelHandles', () => {
  it('offers handles for levels whose fields can be set', () => {
    expect(levelHandles(dates, universe)).toEqual(['start', 'end', 'move']);
    expect(levelHandles(period, universe)).toEqual(['start', 'end', 'move']);
    expect(levelHandles(versions, universe)).toEqual(['start', 'end', 'move']);
    expect(levelHandles({...dates, endField: null}, universe)).toEqual([]);
    expect(levelHandles({...dates, field: {name: 'Type', kind: 'date'}}, universe)).toEqual([]);
  });
});

describe('draggedSpan', () => {
  const span = {start: day('2026-11-02'), end: day('2026-11-06')};
  it('moves an edge or the whole bar by whole days, never shorter than a day', () => {
    expect(draggedSpan(span, 'start', 2)).toEqual({start: day('2026-11-04'), end: span.end});
    expect(draggedSpan(span, 'start', 9)).toEqual({start: span.end, end: span.end});
    expect(draggedSpan(span, 'end', -9)).toEqual({start: span.start, end: span.start});
    expect(draggedSpan(span, 'move', -1)).toEqual({start: day('2026-11-01'), end: day('2026-11-05')});
  });
});

describe('snapToSprints', () => {
  const sprints = sprintsOf('Sprints', universe);
  const s1 = {start: day('2026-11-02'), end: day('2026-11-13')};
  it('lists dated sprints that are not archived', () => {
    expect(sprints.map(s => s.key)).toEqual(['S1', 'S2', 'S3']);
    expect(sprintsOf('Sprints', universe, ['Old']).map(s => s.key)).toEqual(['Old', 'S1', 'S2', 'S3']);
  });
  it('extends and shrinks a multi-value field sprint by sprint', () => {
    expect(snapToSprints({start: s1.start, end: day('2026-11-29')}, s1, 'end', sprints, true))
      .toEqual({span: {start: s1.start, end: day('2026-11-27')}, keys: ['S1', 'S2']});
    const both = {start: s1.start, end: day('2026-11-27')};
    expect(snapToSprints({start: day('2026-11-15'), end: both.end}, both, 'start', sprints, true)?.keys).toEqual(['S2']);
  });
  it('moves by as many sprints as the bar covered', () => {
    const both = {start: s1.start, end: day('2026-11-27')};
    expect(snapToSprints({start: day('2026-11-17'), end: day('2026-12-12')}, both, 'move', sprints, true)?.keys).toEqual(['S2', 'S3']);
  });
  it('picks the nearest sprint for a single-value field', () => {
    expect(snapToSprints({start: day('2026-11-28'), end: day('2026-12-09')}, s1, 'move', sprints, false)?.keys).toEqual(['S3']);
    expect(snapToSprints(s1, s1, 'end', [], false)).toBeNull();
  });
});

describe('planEdit', () => {
  const after = {start: day('2026-11-04'), end: day('2026-11-10')};
  it('sets the dates an edge or a move changes, at noon UTC', () => {
    const before = issue({Start: value(String(noon('2026-11-02'))), End: value(String(noon('2026-11-10')))});
    const edit = planEdit(before, dates, 'start', after, universe, format);
    expect(edit.edits).toEqual([{field: {name: 'Start', kind: 'date'}, type: 'date', value: noon('2026-11-04')}]);
    expect(edit.lines).toEqual([{label: 'Start', from: '11-02', to: '11-04'}]);
    expect(planEdit(before, dates, 'move', after, universe, format).edits).toHaveLength(1);
    expect(planEdit(before, dates, 'end', after, universe, format).edits).toEqual([]);
  });

  it('treats a date and period like two dates: edges keep the other end, a move keeps the period', () => {
    const before = issue({Start: value(String(noon('2026-11-02'))), Estimation: value('3d', 3 * 480)});
    expect(planEdit(before, period, 'move', after, universe, format).edits).toEqual([{field: {name: 'Start', kind: 'date'}, type: 'date', value: noon('2026-11-04')}]);
    // The date's own edge, from Mon 2 Nov to Wed 4 Nov with the end on Wed 4 Nov: one working day left.
    expect(planEdit(before, period, 'start', {start: day('2026-11-04'), end: day('2026-11-04')}, universe, format).edits).toEqual([
      {field: {name: 'Start', kind: 'date'}, type: 'date', value: noon('2026-11-04')},
      {field: {name: 'Estimation', kind: 'period'}, type: 'period', minutes: 480}
    ]);
    const longer = planEdit(before, period, 'end', {start: day('2026-11-02'), end: day('2026-11-10')}, universe, format);
    expect(longer.edits).toEqual([{field: {name: 'Estimation', kind: 'period'}, type: 'period', minutes: 7 * 480}]);
    expect(longer.lines).toEqual([{label: 'Estimation', from: '3d', to: '1w 2d'}]);
    const back = planEdit(before, {...period, dateRole: 'end'}, 'start', {start: day('2026-10-30'), end: day('2026-11-02')}, universe, format);
    expect(back.edits).toEqual([{field: {name: 'Estimation', kind: 'period'}, type: 'period', minutes: 2 * 480}]);
  });

  it('sets the sprints of a version level', () => {
    const before = issue({Sprints: multi(['S1'])});
    expect(planEdit(before, versions, 'end', after, universe, format, ['S1', 'S2']))
      .toEqual({edits: [{field: {name: 'Sprints', kind: 'version'}, type: 'versions', keys: ['S1', 'S2']}], lines: [{label: 'Sprints', from: 'S1', to: 'S1, S2'}]});
    expect(planEdit(before, versions, 'end', after, universe, format, ['S1']).edits).toEqual([]);
  });

  it('keeps the time of day of a date and time field', () => {
    const at = new Date(2026, 10, 20, 15, 30).getTime();
    const edit = dueEdit(issue({Due: value(String(at))}), {name: 'Due', kind: 'datetime'}, Date.UTC(2026, 10, 24), universe, format);
    expect(edit.edits).toEqual([{field: {name: 'Due', kind: 'datetime'}, type: 'date', value: new Date(2026, 10, 24, 15, 30).getTime()}]);
  });
});

describe('saving edits', () => {
  it('shows the new values and builds the REST updates', () => {
    const before = issue({Sprints: multi(['S1']), Sprint: value('S1'), Estimation: value('1d', 480)});
    const edits = [
      {field: {name: 'Sprints', kind: 'version' as const}, type: 'versions' as const, keys: ['S1', 'S2']},
      {field: {name: 'Sprint', kind: 'version' as const}, type: 'versions' as const, keys: ['S2']},
      {field: {name: 'Estimation', kind: 'period' as const}, type: 'period' as const, minutes: 960}
    ];
    expect(editedIssue(before, edits).fields.Sprints?.keys).toEqual(['S1', 'S2']);
    expect(editedIssue(before, edits).fields.Estimation?.minutes).toBe(960);
    expect(fieldUpdates(before, edits, universe)).toEqual([
      {name: 'Sprints', $type: 'MultiVersionIssueCustomField', value: [{name: 'S1'}, {name: 'S2'}]},
      {name: 'Sprint', $type: 'T', value: {name: 'S2'}},
      {name: 'Estimation', $type: 'T', value: {presentation: '960m'}}
    ]);
  });
});

describe('creating plans', () => {
  const sprints = sprintsOf('Sprints', universe);

  it('draws a span either way from the pressed day', () => {
    expect(drawnSpan(day('2026-11-10'), 3)).toEqual({start: day('2026-11-10'), end: day('2026-11-13')});
    expect(drawnSpan(day('2026-11-10'), -2)).toEqual({start: day('2026-11-08'), end: day('2026-11-10')});
  });

  it('plans a click from the estimate in working days', () => {
    expect(estimateSpan(day('2026-11-12'), 24)).toEqual({start: day('2026-11-12'), end: day('2026-11-16')});
    expect(estimateSpan(day('2026-11-12'), undefined)).toEqual({start: day('2026-11-12'), end: day('2026-11-12')});
    expect(estimateSpan(day('2026-11-14'), 4)).toEqual({start: day('2026-11-16'), end: day('2026-11-16')});
  });

  it('finds the sprint of a day and snaps drawn spans to the sprints they touch', () => {
    expect(sprintAt(sprints, day('2026-11-20'))?.key).toBe('S2');
    expect(sprintAt(sprints, day('2026-11-14'))?.key).toBe('S2');
    expect(snapToSprints({start: day('2026-11-10'), end: day('2026-11-18')}, {start: 0, end: 0}, 'draw', sprints, true)?.keys).toEqual(['S1', 'S2']);
    expect(snapToSprints({start: day('2026-11-10'), end: day('2026-11-18')}, {start: 0, end: 0}, 'draw', sprints, false)?.keys).toEqual(['S1']);
  });

  it('sets every field of the level for a new plan', () => {
    const blank = issue({});
    const span = {start: day('2026-11-02'), end: day('2026-11-06')};
    expect(planEdit(blank, dates, 'draw', span, universe, format).edits.map(e => e.field.name)).toEqual(['Start', 'End']);
    expect(planEdit(blank, period, 'draw', span, universe, format).edits).toEqual([
      {field: {name: 'Start', kind: 'date'}, type: 'date', value: noon('2026-11-02')},
      {field: {name: 'Estimation', kind: 'period'}, type: 'period', minutes: 5 * 480}
    ]);
    expect(planEdit(blank, versions, 'draw', span, universe, format, ['S1']).edits).toHaveLength(1);
    expect(dueEdit(blank, {name: 'Due', kind: 'datetime'}, span.end, universe, format).lines).toEqual([{label: 'Due', from: 'none', to: '11-06'}]);
  });
});

describe('missingLevels', () => {
  const span = {start: day('2026-11-02'), end: day('2026-11-13')};
  it('lists the editable levels without a span, then the due date', () => {
    expect(missingLevels([true, true], [null, span], true, false)).toEqual([0, 'due']);
    expect(missingLevels([true, true], [span, span], true, true)).toEqual([]);
    expect(missingLevels([false, true], [null, span], true, true)).toEqual([]);
    expect(missingLevels([true, true], [null, span], false, false)).toEqual([0]);
  });
});
