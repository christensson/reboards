import React, {memo} from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import userIcon from '@jetbrains/icons/user-12px';
import warningIcon from '@jetbrains/icons/warning-12px';
import type {CardSize} from '@/common/storage/prefs';
import type {GanttIssueRow, Span} from '../../model/gantt';
import type {GanttScale} from '../../model/ganttScale';
import {BAR_HEIGHT, ROW_HEIGHT, dayEndX, levelHeight, spanBox} from './geometry';

type Props = {
  row: GanttIssueRow;
  scale: GanttScale;
  size: CardSize;
};

/** Gap between the last mark of a row and its persons chip. */
const CHIP_GAP = 6;
const PERSONS_DECIMALS = 1;

const vertical = (height: number, size: CardSize): React.CSSProperties => ({top: (ROW_HEIGHT[size] - height) / 2, height});

/** The finest level with a plan; it is the solid bar, coarser ones are bands behind it. */
const finestIndex = (spans: (Span | null)[]): number => {
  for (let index = spans.length - 1; index >= 0; index--) {
    if (spans[index]) {
      return index;
    }
  }
  return -1;
};

const levelClass = (index: number, finest: number, count: number, row: GanttIssueRow): string => {
  if (index !== finest) {
    return 'gantt-bar gantt-bar_band';
  }
  // Planned at a coarser level only: an outlined band, a rough plan rather than a committed one.
  const rough = count > 1 && index < count - 1;
  const outside = row.early || row.late ? ' gantt-bar_outside' : '';
  return `gantt-bar ${rough ? 'gantt-bar_rough' : 'gantt-bar_detailed'}${outside}`;
};

const PlanBars: React.FC<Props> = ({row, scale, size}) => {
  const spans = row.schedule.spans;
  const finest = finestIndex(spans);
  return (
    <>
      {spans.map((span, index) => {
        if (!span) {
          return null;
        }
        const box = spanBox(scale, span);
        const height = levelHeight(index, spans.length, size);
        // eslint-disable-next-line react/no-array-index-key -- one bar per planning level, in level order
        return <div key={index} className={levelClass(index, finest, spans.length, row)} style={{left: box.left, width: box.width, ...vertical(height, size)}}/>;
      })}
    </>
  );
};

/** The part of the plan past the due date. */
const Overrun: React.FC<Props & {end: number}> = ({row, scale, size, end}) => {
  const due = row.schedule.due;
  if (!row.overrun || due === undefined) {
    return null;
  }
  const left = dayEndX(scale, due);
  return <div className="gantt-overrun" style={{left, width: dayEndX(scale, end) - left, ...vertical(BAR_HEIGHT[size], size)}}/>;
};

const Persons: React.FC<{row: GanttIssueRow; left: number; size: CardSize}> = ({row, left, size}) => {
  const {persons, pastEnd} = row.workload;
  if (persons === undefined && !pastEnd) {
    return null;
  }
  const style = {left: left + CHIP_GAP, ...vertical(ROW_HEIGHT[size], size)};
  if (pastEnd) {
    return (
      <span className="gantt-persons gantt-persons_warning" style={style}>
        <Icon glyph={warningIcon}/>
        {'past end'}
      </span>
    );
  }
  return (
    <span className={`gantt-persons${(persons ?? 0) > 1 ? ' gantt-persons_many' : ''}`} style={style}>
      <Icon glyph={userIcon}/>
      {(persons ?? 0).toFixed(PERSONS_DECIMALS)}
    </span>
  );
};

/**
 * The marks of one chart row: the planning levels (bands behind the detailed bar), the span
 * derived from subtasks or borrowed from the parent, the due diamond with any overrun past it,
 * and the persons needed.
 */
const GanttBarsComponent: React.FC<Props> = ({row, scale, size}) => {
  const due = row.schedule.due;
  const ends: number[] = [];
  const derived = row.derived ? spanBox(scale, row.derived) : null;
  const borrowed = row.borrowed ? spanBox(scale, row.borrowed) : null;
  row.schedule.spans.forEach(span => span && ends.push(span.end));
  [row.derived, row.borrowed].forEach(span => span && ends.push(span.end));
  const planEnd = ends.length > 0 ? Math.max(...ends) : undefined;
  const marksEnd = Math.max(...[planEnd, due].filter((v): v is number => v !== undefined));
  return (
    <>
      {derived && <div className="gantt-bar gantt-bar_derived" style={{left: derived.left, width: derived.width, ...vertical(BAR_HEIGHT[size], size)}}/>}
      {borrowed && <div className="gantt-bar gantt-bar_borrowed" style={{left: borrowed.left, width: borrowed.width, ...vertical(BAR_HEIGHT[size], size)}}/>}
      <PlanBars row={row} scale={scale} size={size}/>
      {planEnd !== undefined && <Overrun row={row} scale={scale} size={size} end={planEnd}/>}
      {due !== undefined && (
        <span className={`gantt-due${row.overdue ? ' gantt-due_overdue' : ''}`} style={{left: dayEndX(scale, due), top: ROW_HEIGHT[size] / 2}}/>
      )}
      {Number.isFinite(marksEnd) && <Persons row={row} left={dayEndX(scale, marksEnd)} size={size}/>}
    </>
  );
};

export const GanttBars = memo(GanttBarsComponent);
