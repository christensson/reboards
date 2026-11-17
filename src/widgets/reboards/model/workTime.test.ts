import {describe, expect, it} from 'vitest';
import {emptyGantt} from '@/common/model/board-config';
import type {YtProjectCustomField} from '@/common/youtrack/types';
import {buildFieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {addWorkDays, estimateHours, formatWorkHours, isWorkday, periodWorkDays, personsNeeded, workDaysBetween} from './workTime';

const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const plain = (name: string, typeId: string): YtProjectCustomField => ({id: `pf-${name}`, $type: 'X', field: {id: name, name, fieldType: {id: typeId, valueType: typeId}}});
const universe = buildFieldUniverse([[plain('Estimation', 'period'), plain('Hours', 'integer'), plain('Days', 'float')]]);
const value = (key: string, minutes?: number) => ({$type: 'X', key, label: key, labels: [key], keys: [key], ...(minutes === undefined ? {} : {minutes})});
const issue = (fields: BoardIssue['fields']): BoardIssue => ({
  id: '1', idReadable: 'SAN-1', summary: '', projectId: 'p', projectShortName: 'SAN', number: 1, tags: [], links: [], parentIds: [], childIds: [], fields
});

describe('working days', () => {
  it('skips weekends', () => {
    expect(isWorkday(day('2026-11-16'))).toBe(true); // Monday
    expect(isWorkday(day('2026-11-21'))).toBe(false); // Saturday
    expect(isWorkday(day('2026-11-22'))).toBe(false);
  });

  it('counts periods in 8 hour days', () => {
    expect(periodWorkDays(480)).toBe(1);
    expect(periodWorkDays(5 * 480)).toBe(5);
  });

  it('adds working days with both ends included', () => {
    expect(addWorkDays(day('2026-11-16'), 1, 1)).toBe(day('2026-11-16'));
    expect(addWorkDays(day('2026-11-16'), 5, 1)).toBe(day('2026-11-20'));
    expect(addWorkDays(day('2026-11-19'), 3, 1)).toBe(day('2026-11-23'));
    expect(addWorkDays(day('2026-11-16'), 1.5, 1)).toBe(day('2026-11-17'));
    expect(addWorkDays(day('2026-11-20'), 5, -1)).toBe(day('2026-11-16'));
    expect(addWorkDays(day('2026-11-21'), 1, 1)).toBe(day('2026-11-23'));
    expect(addWorkDays(day('2026-11-22'), 2, -1)).toBe(day('2026-11-19'));
  });

  it('counts working days between two days', () => {
    expect(workDaysBetween(day('2026-11-16'), day('2026-11-16'))).toBe(1);
    expect(workDaysBetween(day('2026-11-16'), day('2026-11-22'))).toBe(5);
    expect(workDaysBetween(day('2026-11-20'), day('2026-11-23'))).toBe(2);
    expect(workDaysBetween(day('2026-11-16'), day('2026-11-29'))).toBe(10);
    expect(workDaysBetween(day('2026-11-21'), day('2026-11-22'))).toBe(0);
    expect(workDaysBetween(day('2026-11-23'), day('2026-11-16'))).toBe(0);
  });
});

describe('estimates', () => {
  it('reads periods, and numbers in their unit', () => {
    const gantt = {...emptyGantt(), estimationField: {name: 'Estimation', kind: 'period' as const}};
    expect(estimateHours(issue({Estimation: value('1w', 2400)}), gantt, universe)).toBe(40);
    expect(estimateHours(issue({Estimation: null}), gantt, universe)).toBeUndefined();
    const hours = {...emptyGantt(), estimationField: {name: 'Hours', kind: 'integer' as const}};
    expect(estimateHours(issue({Hours: value('12')}), hours, universe)).toBe(12);
    const days = {...emptyGantt(), estimationField: {name: 'Days', kind: 'float' as const}, estimationUnit: 'days' as const};
    expect(estimateHours(issue({Days: value('2.5')}), days, universe)).toBe(20);
  });

  it('turns an estimate into persons', () => {
    expect(personsNeeded(80, 5)).toBe(2);
    expect(personsNeeded(20, 5)).toBe(0.5);
  });

  it('formats working hours as a period', () => {
    expect(formatWorkHours(52)).toBe('1w 1d 4h');
    expect(formatWorkHours(0)).toBe('0h');
  });
});
