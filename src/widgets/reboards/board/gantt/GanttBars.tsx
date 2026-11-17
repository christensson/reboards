import React, {memo} from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import userIcon from '@jetbrains/icons/user-12px';
import warningIcon from '@jetbrains/icons/warning-12px';
import type {CardSize} from '@/common/storage/prefs';
import type {GanttIssueRow, Span} from '../../model/gantt';
import type {DragHandle, DragTarget} from '../../model/ganttEdit';
import type {GanttScale} from '../../model/ganttScale';
import {BAR_HEIGHT, ROW_HEIGHT, dayEndX, levelHeight, spanBox} from './geometry';

/** What can be dragged on a row, and the drag on it, if any. */
export type RowEdit = {
  /** The handles of each planning level; empty where the level cannot be dragged. */
  handles: DragHandle[][];
  /** Level names, for the handles' tooltips. */
  names: string[];
  due: boolean;
  /** The faint bar of the parent's span can be dragged into a plan of the issue's own. */
  borrowed: boolean;
  /** The issue has no time: a plan can be drawn on its row. */
  plannable: boolean;
  /** The level a new plan starts at, until another is picked when confirming. */
  createLevel: number | 'due';
  /** The issue can still be planned at another level: a "+" follows its marks. */
  addable: boolean;
  onAdd: (event: React.MouseEvent) => void;
  /** Where the bar being dragged (or waiting for confirmation) would go. */
  pending: {level: number | 'due'; span: Span} | null;
  saving: boolean;
  onGrab: (event: React.PointerEvent, target: DragTarget, before: Span) => void;
};

type Props = {
  row: GanttIssueRow;
  scale: GanttScale;
  size: CardSize;
  edit?: RowEdit;
};

/** Gap between the last mark of a row and its persons chip. */
const CHIP_GAP = 6;
/** Room taken by the "+" that adds a plan, when the row has one. */
const ADD_WIDTH = 22;
const ADD_SIZE = 16;
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

type BarProps = {row: GanttIssueRow; index: number; span: Span; className: string; style: React.CSSProperties; edit?: RowEdit};

/** A planning level's bar; when it can be dragged, its body moves it and its edges carry handles. */
const PlanBar: React.FC<BarProps> = ({row, index, span, className, style, edit}) => {
  const handles = edit?.handles[index] ?? [];
  if (!edit || handles.length === 0) {
    return <div className={className} style={style}/>;
  }
  const name = edit.names[index] ?? 'plan';
  const grab = (handle: DragHandle) => (event: React.PointerEvent) => {
    event.stopPropagation();
    edit.onGrab(event, {issueId: row.issue.id, level: index, handle}, span);
  };
  const dragged = edit.pending?.level === index ? ' gantt-bar_dragged' : '';
  return (
    <div
      className={`${className} gantt-bar_editable${dragged}`}
      style={style}
      title={`Drag to move ${name}`}
      onPointerDown={handles.includes('move') ? grab('move') : undefined}
    >
      {handles.includes('start') && <span className="gantt-handle gantt-handle_start" title={`Drag to change ${name} start`} onPointerDown={grab('start')}/>}
      {handles.includes('end') && <span className="gantt-handle gantt-handle_end" title={`Drag to change ${name} end`} onPointerDown={grab('end')}/>}
    </div>
  );
};

const PlanBars: React.FC<Props> = ({row, scale, size, edit}) => {
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
        return (
          <PlanBar
            // eslint-disable-next-line react/no-array-index-key -- one bar per planning level, in level order
            key={index}
            row={row}
            index={index}
            span={span}
            className={levelClass(index, finest, spans.length, row)}
            style={{left: box.left, width: box.width, ...vertical(height, size)}}
            edit={edit}
          />
        );
      })}
    </>
  );
};

/** The faint bar of an estimate-only subtask in its parent's span; dragging it gives the subtask a plan of its own. */
const Borrowed: React.FC<{row: GanttIssueRow; span: Span; style: React.CSSProperties; edit?: RowEdit}> = ({row, span, style, edit}) => {
  if (!edit?.borrowed) {
    return <div className="gantt-bar gantt-bar_borrowed" style={style}/>;
  }
  const grab = (handle: DragHandle) => (event: React.PointerEvent) => {
    event.stopPropagation();
    edit.onGrab(event, {issueId: row.issue.id, level: edit.createLevel, handle, create: true}, span);
  };
  const dragged = edit.pending ? ' gantt-bar_dragged' : '';
  return (
    <div className={`gantt-bar gantt-bar_borrowed gantt-bar_editable${dragged}`} style={style} title="Drag to give this issue a plan of its own" onPointerDown={grab('move')}>
      <span className="gantt-handle gantt-handle_start" title="Drag to plan the start" onPointerDown={grab('start')}/>
      <span className="gantt-handle gantt-handle_end" title="Drag to plan the end" onPointerDown={grab('end')}/>
    </div>
  );
};

/** Where the dragged bar or diamond would go: a dashed outline at the level's height. */
const Ghost: React.FC<Props> = ({row, scale, size, edit}) => {
  const pending = edit?.pending;
  if (!pending) {
    return null;
  }
  if (pending.level === 'due') {
    return <span className="gantt-due gantt-due_ghost" style={{left: dayEndX(scale, pending.span.start), top: ROW_HEIGHT[size] / 2}}/>;
  }
  const box = spanBox(scale, pending.span);
  const height = levelHeight(pending.level, row.schedule.spans.length, size);
  return <div className="gantt-ghost" style={{left: box.left, width: box.width, ...vertical(height, size)}}/>;
};

/** "+" after a row's marks: plans the issue at a level it is missing, from its current plan. */
const AddPlan: React.FC<{left: number; size: CardSize; onAdd: (event: React.MouseEvent) => void}> = ({left, size, onAdd}) => (
  <button
    type="button"
    className="gantt-add"
    style={{left: left + CHIP_GAP, top: (ROW_HEIGHT[size] - ADD_SIZE) / 2}}
    title="Add a plan"
    aria-label="Add a plan"
    onPointerDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      onAdd(event);
    }}
  >
    <svg className="gantt-add__icon" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
      <path d="M4 0.5 V7.5 M0.5 4 H7.5"/>
    </svg>
  </button>
);

/** The due diamond; it can be dragged to another day. */
const Due: React.FC<Props & {due: number}> = ({row, scale, size, edit, due}) => {
  const editable = Boolean(edit?.due);
  const classes = ['gantt-due', row.overdue ? 'gantt-due_overdue' : '', editable ? 'gantt-due_editable' : '', edit?.pending?.level === 'due' ? 'gantt-due_dragged' : ''];
  return (
    <span
      className={classes.filter(Boolean).join(' ')}
      style={{left: dayEndX(scale, due), top: ROW_HEIGHT[size] / 2}}
      title={editable ? 'Drag to change the due date' : undefined}
      onPointerDown={editable && edit ? event => {
        event.stopPropagation();
        edit.onGrab(event, {issueId: row.issue.id, level: 'due', handle: 'move'}, {start: due, end: due});
      } : undefined}
    />
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
const GanttBarsComponent: React.FC<Props> = ({row, scale, size, edit}) => {
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
      {borrowed && row.borrowed && <Borrowed row={row} span={row.borrowed} style={{left: borrowed.left, width: borrowed.width, ...vertical(BAR_HEIGHT[size], size)}} edit={edit}/>}
      <PlanBars row={row} scale={scale} size={size} edit={edit}/>
      {planEnd !== undefined && <Overrun row={row} scale={scale} size={size} end={planEnd}/>}
      {due !== undefined && <Due row={row} scale={scale} size={size} edit={edit} due={due}/>}
      <Ghost row={row} scale={scale} size={size} edit={edit}/>
      {Number.isFinite(marksEnd) && edit?.addable && <AddPlan left={dayEndX(scale, marksEnd)} size={size} onAdd={edit.onAdd}/>}
      {Number.isFinite(marksEnd) && <Persons row={row} left={dayEndX(scale, marksEnd) + (edit?.addable ? ADD_WIDTH : 0)} size={size}/>}
    </>
  );
};

export const GanttBars = memo(GanttBarsComponent);
