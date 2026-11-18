import React from 'react';
import type {GanttConfig} from '@/common/model/board-config';
import type {GanttIssueRow, Span} from '../../model/gantt';
import {formatWorkHours} from '../../model/workTime';
import {useDateFormat} from '../../data/useDateFormat';

type Props = {
  row: GanttIssueRow;
  gantt: GanttConfig;
  /** Where the pointer is, in viewport pixels. */
  x: number;
  y: number;
};

const OFFSET = 16;
const WIDTH = 320;
const PERSONS_DECIMALS = 1;

type Line = {label: string; value: string; tone?: 'warning' | 'error' | 'muted'};

const spanText = (span: Span, format: (day: number) => string): string => {
  const range = span.start === span.end ? format(span.start) : `${format(span.start)} – ${format(span.end)}`;
  const names = [span.startLabel, span.endLabel].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index);
  return names.length > 0 ? `${range} (${names.join(' – ')})` : range;
};

const planLines = (row: GanttIssueRow, gantt: GanttConfig, format: (day: number) => string): Line[] => [
  ...gantt.levels.map((level, index): Line => {
    const span = row.schedule.spans[index];
    return span ? {label: level.name, value: spanText(span, format)} : {label: level.name, value: 'Not planned', tone: 'muted'};
  }),
  ...(row.derived ? [{label: 'From subtasks', value: spanText(row.derived, format)}] : []),
  ...(row.borrowed ? [{label: 'Parent’s plan', value: spanText(row.borrowed, format)}] : [])
];

const dueLines = (row: GanttIssueRow, format: (day: number) => string): Line[] => {
  const due = row.schedule.due;
  if (due === undefined) {
    return [];
  }
  return [
    {label: 'Due', value: `${format(due)}${row.overdue ? ' · overdue' : ''}`, ...(row.overdue ? {tone: 'error' as const} : {})},
    ...(row.overrun ? [{label: '', value: 'Planned to end after the due date', tone: 'error' as const}] : [])
  ];
};

const workLines = (row: GanttIssueRow, gantt: GanttConfig, format: (day: number) => string): Line[] => {
  const {estimate} = row.schedule;
  if (estimate === undefined) {
    return [];
  }
  const meaning = gantt.estimationMeaning === 'remaining' ? 'remaining' : 'total';
  const lines: Line[] = [{label: 'Estimate', value: `${formatWorkHours(estimate)} ${meaning}`}];
  const {persons, workDays, from, pastEnd} = row.workload;
  if (pastEnd) {
    lines.push({label: 'Persons', value: 'The planned time is over but work is left', tone: 'warning'});
  } else if (persons !== undefined && workDays !== undefined && from !== undefined) {
    const start = gantt.estimationMeaning === 'remaining' ? `from ${format(from)}` : 'over the plan';
    lines.push({label: 'Persons', value: `${persons.toFixed(PERSONS_DECIMALS)} over ${workDays} working days ${start}`});
  }
  return lines;
};

const noteLines = (row: GanttIssueRow): Line[] => [
  ...(row.early ? [{label: '', value: 'Starts before its parent’s plan', tone: 'warning' as const}] : []),
  ...(row.late ? [{label: '', value: 'Ends after its parent’s plan', tone: 'warning' as const}] : []),
  ...(row.issue.resolved ? [{label: '', value: 'Resolved', tone: 'muted' as const}] : []),
  ...(row.timed ? [] : [{label: '', value: 'No time planned', tone: 'muted' as const}])
];

/** What a chart row means in words, next to the pointer. */
export const GanttDetails: React.FC<Props> = ({row, gantt, x, y}) => {
  const format = useDateFormat();
  const lines = [...planLines(row, gantt, format), ...dueLines(row, format), ...workLines(row, gantt, format), ...noteLines(row)];
  const left = Math.max(0, Math.min(x + OFFSET, window.innerWidth - WIDTH - OFFSET));
  const below = y < window.innerHeight / 2;
  const style: React.CSSProperties = below ? {left, top: y + OFFSET} : {left, bottom: window.innerHeight - y + OFFSET};
  return (
    <div className="gantt-details" style={style} role="tooltip">
      <div className="gantt-details__title">
        <span className="gantt-details__id">{row.issue.idReadable}</span>
        {row.issue.summary}
      </div>
      <dl className="gantt-details__list">
        {lines.map(line => (
          <div key={`${line.label}:${line.value}`} className={`gantt-details__line${line.tone ? ` gantt-details__line_${line.tone}` : ''}`}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** What the marks on the chart mean. */
export const GanttLegend: React.FC<{gantt: GanttConfig}> = ({gantt}) => (
  <div className="gantt-legend" role="note">
    {gantt.levels.length > 1 && (
      <div className="gantt-legend__item">
        <span className="gantt-legend__swatch gantt-legend__swatch_frame"/>
        {`Coarser plans (${gantt.levels.slice(0, -1).map(level => level.name).join(', ')}) as frames around`}
      </div>
    )}
    {gantt.levels.length > 0 && (
      <div className="gantt-legend__item">
        <span className="gantt-legend__swatch gantt-legend__swatch_detailed"/>
        {gantt.levels[gantt.levels.length - 1].name}
      </div>
    )}
    {gantt.levels.length > 1 && (
      <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_rough"/>Planned at a coarser level only</div>
    )}
    <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_derived"/>Spanned by its subtasks</div>
    <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_outside"/>Planned outside its parent’s plan</div>
    {gantt.estimationField && (
      <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_borrowed"/>Estimate only, in its parent’s plan</div>
    )}
    {gantt.dueField && (
      <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_due"/>Due date (red when overdue)</div>
    )}
    {gantt.dueField && (
      <div className="gantt-legend__item"><span className="gantt-legend__swatch gantt-legend__swatch_overrun"/>Planned past the due date</div>
    )}
    {gantt.estimationField && (
      <div className="gantt-legend__item gantt-legend__item_text">{`Persons needed: estimate ÷ ${gantt.estimationMeaning === 'remaining' ? 'working days left' : 'planned working days'} (8 h days, 5-day weeks)`}</div>
    )}
  </div>
);
