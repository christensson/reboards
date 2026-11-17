import {useCallback, useMemo, useState} from 'react';
import {type GanttConfig, isDateKind} from '@/common/model/board-config';
import type {FieldUniverse} from '../../model/fieldUniverse';
import {type GanttIssueRow, type GanttRow, type Span, detailedSpan} from '../../model/gantt';
import {
  type DragTarget,
  type Edit,
  type FieldEdit,
  draggedSpan,
  drawnSpan,
  dueEdit,
  estimateSpan,
  levelHandles,
  missingLevels,
  planEdit,
  snapToSprints,
  sprintsOf
} from '../../model/ganttEdit';
import type {BoardIssue} from '../../model/issue';
import {MS_PER_DAY, workDaysBetween} from '../../model/workTime';
import {useDateFormat} from '../../data/useDateFormat';
import type {RowEdit} from './GanttBars';
import {type DragPoint, useBarDrag} from './useBarDrag';

type Options = {
  gantt: GanttConfig;
  rows: GanttRow[];
  universe: FieldUniverse;
  canEdit: (issue: BoardIssue) => boolean;
  onSave: (issue: BoardIssue, edits: FieldEdit[]) => Promise<void>;
  container: HTMLDivElement | null;
  listWidth: number;
  pxPerDay: number;
};

type Level = number | 'due';

/** A level a new plan can set, for the switch in the confirmation. */
export type PlanChoice = {key: string; label: string};

/** A drag in progress, or a dropped one waiting for Apply or Cancel. */
type Pending = {
  target: DragTarget;
  issue: BoardIssue;
  /** New plans: the span as drawn or dragged, before it is fitted to the chosen level. */
  raw: Span;
  /** New plans from a click: the clicked day, which picks the sprint for a sprint level. */
  point?: number;
  span: Span;
  keys: string[];
  at: DragPoint;
  confirm: {title: string; edit: Edit} | null;
  /** New plans: the levels the Set switch offers. */
  choices?: PlanChoice[];
};

const NO_EDITS: Edit = {edits: [], lines: []};
const DUE_KEY = 'due';

const levelOfKey = (key: string): Level => (key === DUE_KEY ? 'due' : Number(key));
const keyOfLevel = (level: Level): string => (level === 'due' ? DUE_KEY : String(level));

/**
 * Rescheduling in the Gantt chart: dragging a planning level's edges or body, or the due
 * diamond, shows where it would go; dropping asks to confirm the changed fields, and Apply saves.
 * Issues without a plan get one by drawing on their row, by a click (from the estimate), or by
 * dragging the faint bar of their parent's span; the confirmation then offers the level to set.
 */
export const useGanttEdit = ({gantt, rows, universe, canEdit, onSave, container, listWidth, pxPerDay}: Options) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const format = useDateFormat();
  const issues = useMemo(() => new Map(rows.flatMap(row => (row.type === 'issue' ? [[row.issue.id, row.issue] as const] : []))), [rows]);
  const estimates = useMemo(() => new Map(rows.flatMap(row => (row.type === 'issue' ? [[row.issue.id, row.schedule.estimate] as const] : []))), [rows]);

  const editableDue = Boolean(gantt.dueField && isDateKind(universe.byName.get(gantt.dueField.name)?.kind ?? gantt.dueField.kind));
  const names = useMemo(() => gantt.levels.map(level => level.name), [gantt.levels]);
  const handlesByLevel = useMemo(() => gantt.levels.map(level => levelHandles(level, universe)), [gantt.levels, universe]);
  /** What a new plan can set: the editable levels, then the due date. */
  const choices = useMemo<PlanChoice[]>(() => [
    ...gantt.levels.flatMap((level, index) => (handlesByLevel[index].length > 0 ? [{key: String(index), label: level.name}] : [])),
    ...(editableDue ? [{key: DUE_KEY, label: 'Due date'}] : [])
  ], [gantt.levels, handlesByLevel, editableDue]);
  /** A new plan starts at the most detailed editable level, else the due date. */
  const createLevel: Level | null = useMemo(() => {
    const levels = choices.filter(choice => choice.key !== DUE_KEY);
    if (levels.length > 0) {
      return levelOfKey(levels[levels.length - 1].key);
    }
    return choices.length > 0 ? 'due' : null;
  }, [choices]);

  /** Fits a new plan's span to a level: a day for the due date, sprints for a sprint level. */
  const fit = useCallback((level: Level, issue: BoardIssue, raw: Span, point?: number): {span: Span; keys: string[]} => {
    if (level === 'due') {
      return {span: {start: raw.end, end: raw.end}, keys: []};
    }
    const field = gantt.levels[level]?.source === 'version' ? gantt.levels[level].field : null;
    if (!field) {
      return {span: raw, keys: []};
    }
    const current = issue.fields[field.name]?.keys ?? [];
    const multi = Boolean(universe.byName.get(field.name)?.multi);
    const where = point === undefined ? raw : {start: point, end: point};
    return snapToSprints(where, where, 'draw', sprintsOf(field.name, universe, current), multi) ?? {span: raw, keys: []};
  }, [gantt.levels, universe]);

  /** Where a drag by whole days takes the bar, snapped to sprints for a version field. */
  const resolve = useCallback((target: DragTarget, issue: BoardIssue, before: Span, deltaDays: number): {raw: Span; span: Span; keys: string[]} => {
    if (target.create) {
      const raw = target.handle === 'draw' ? drawnSpan(before.start, deltaDays) : draggedSpan(before, target.handle, deltaDays);
      return {raw, ...fit(target.level, issue, raw)};
    }
    if (target.level === 'due') {
      const day = before.start + deltaDays * MS_PER_DAY;
      return {raw: {start: day, end: day}, span: {start: day, end: day}, keys: []};
    }
    const level = gantt.levels[target.level];
    const dragged = draggedSpan(before, target.handle, deltaDays);
    if (level?.source !== 'version' || !level.field) {
      return {raw: dragged, span: dragged, keys: []};
    }
    const current = issue.fields[level.field.name]?.keys ?? [];
    const multi = Boolean(universe.byName.get(level.field.name)?.multi);
    const snapped = snapToSprints(dragged, before, target.handle, sprintsOf(level.field.name, universe, current), multi) ?? {span: before, keys: current};
    return {raw: dragged, ...snapped};
  }, [gantt.levels, universe, fit]);

  const editOf = useCallback((target: DragTarget, issue: BoardIssue, span: Span, keys: string[]): {title: string; edit: Edit} => {
    if (target.level === 'due') {
      const title = target.create ? `Plan ${issue.idReadable}` : `Change the due date of ${issue.idReadable}`;
      return {title, edit: gantt.dueField ? dueEdit(issue, gantt.dueField, span.start, universe, format) : NO_EDITS};
    }
    const level = gantt.levels[target.level];
    const title = target.create ? `Plan ${issue.idReadable}` : `Change ${level?.name ?? 'the plan'} of ${issue.idReadable}`;
    // A new plan sets every field of the level, whichever edge was dragged.
    const handle = target.create ? 'draw' : target.handle;
    return {title, edit: level ? planEdit(issue, level, handle, span, universe, format, keys) : NO_EDITS};
  }, [gantt.levels, gantt.dueField, universe, format]);

  const withConfirm = useCallback((current: Pending, at: DragPoint): Pending | null => {
    const confirm = editOf(current.target, current.issue, current.span, current.keys);
    // Dropped where it was: nothing to confirm.
    return confirm.edit.edits.length > 0 ? {...current, at, confirm} : null;
  }, [editOf]);

  const {grab} = useBarDrag({
    container,
    listWidth,
    pxPerDay,
    onPreview: (target, before, deltaDays, at) => {
      const issue = issues.get(target.issueId);
      if (issue) {
        setPending({target, issue, ...resolve(target, issue, before, deltaDays), at, confirm: null});
      }
    },
    onDrop: at => setPending(current => (current ? withConfirm(current, at) : null)),
    onCancel: () => setPending(null),
    // A click on an empty row plans from the estimate, starting on the clicked day.
    onClick: (target, before, at) => {
      const issue = issues.get(target.issueId);
      if (!issue || target.handle !== 'draw') {
        return;
      }
      const raw = estimateSpan(before.start, estimates.get(issue.id));
      setPending(withConfirm({target, issue, raw, point: before.start, ...fit(target.level, issue, raw, before.start), at, confirm: null}, at));
    }
  });

  const cancel = useCallback(() => setPending(null), []);
  const apply = useCallback(() => {
    if (!pending?.confirm) {
      return;
    }
    const {issue, confirm} = pending;
    setPending(null);
    if (confirm.edit.edits.length === 0) {
      return;
    }
    setSaving(current => new Set(current).add(issue.id));
    onSave(issue, confirm.edit.edits).finally(() => setSaving(current => {
      const next = new Set(current);
      next.delete(issue.id);
      return next;
    }));
  }, [pending, onSave]);

  /** A new plan's level picked in the confirmation: its span and fields follow. */
  const choose = useCallback((key: string) => setPending(current => {
    if (!current?.confirm) {
      return current;
    }
    const target = {...current.target, level: levelOfKey(key)};
    const fitted = fit(target.level, current.issue, current.raw, current.point);
    const confirm = editOf(target, current.issue, fitted.span, fitted.keys);
    return {...current, target, ...fitted, confirm};
  }), [fit, editOf]);

  /** Starts drawing a new plan on an issue's empty row, from the pressed day. */
  const startDraw = useCallback((event: React.PointerEvent, issueId: string, day: number) => {
    if (createLevel !== null) {
      grab(event, {issueId, level: createLevel, handle: 'draw', create: true}, {start: day, end: day});
    }
  }, [grab, createLevel]);

  const choiceOf = useCallback((level: Level): PlanChoice => ({key: keyOfLevel(level), label: level === 'due' ? 'Due date' : names[level] ?? ''}), [names]);

  /** The levels a timed row can still be planned at, most detailed last (due date at the very end). */
  const missingOf = useCallback((row: GanttIssueRow): Level[] => {
    const hasPlan = row.schedule.spans.some(Boolean) || row.schedule.due !== undefined;
    return row.timed && !row.borrowed && hasPlan
      ? missingLevels(handlesByLevel.map(handles => handles.length > 0), row.schedule.spans, editableDue, row.schedule.due !== undefined)
      : [];
  }, [handlesByLevel, editableDue]);

  /** "+" on a bar: a missing level, preset to the issue's most detailed plan (or due day), to confirm. */
  const startAdd = useCallback((row: GanttIssueRow, at: DragPoint) => {
    const missing = missingOf(row);
    const source = detailedSpan(row.schedule) ?? (row.schedule.due === undefined ? undefined : {start: row.schedule.due, end: row.schedule.due});
    if (missing.length === 0 || !source) {
      return;
    }
    const levels = missing.filter(level => level !== 'due');
    const level = levels.length > 0 ? levels[levels.length - 1] : 'due';
    const target: DragTarget = {issueId: row.issue.id, level, handle: 'draw', create: true};
    setPending(withConfirm({target, issue: row.issue, raw: source, ...fit(level, row.issue, source), at, confirm: null, choices: missing.map(choiceOf)}, at));
  }, [missingOf, fit, withConfirm, choiceOf]);

  /** What can be dragged on each row the user may change. */
  const rowEdits = useMemo(() => {
    const edits = new Map<string, RowEdit>();
    rows.forEach(row => {
      if (row.type !== 'issue' || !canEdit(row.issue)) {
        return;
      }
      const id = row.issue.id;
      edits.set(id, {
        handles: handlesByLevel.map((handles, index) => (row.timed && row.schedule.spans[index] ? handles : [])),
        names,
        due: editableDue && row.schedule.due !== undefined,
        borrowed: Boolean(row.borrowed) && createLevel !== null,
        plannable: !row.timed && createLevel !== null,
        createLevel: createLevel ?? 'due',
        addable: missingOf(row).length > 0,
        onAdd: event => startAdd(row, {x: event.clientX, y: event.clientY}),
        pending: pending?.target.issueId === id ? {level: pending.target.level, span: pending.span} : null,
        saving: saving.has(id),
        onGrab: grab
      });
    });
    return edits;
  }, [rows, canEdit, handlesByLevel, names, editableDue, createLevel, pending, saving, grab, missingOf, startAdd]);

  const rowEdit = useCallback((row: GanttIssueRow): RowEdit | undefined => rowEdits.get(row.issue.id), [rowEdits]);

  /** "5 Nov – 18 Nov · 10 working days", "S3 – S5" or the due day, next to the pointer while dragging. */
  const dragLabel = useMemo(() => {
    if (!pending || pending.confirm) {
      return null;
    }
    const {span, keys, target} = pending;
    let text: string;
    if (target.level === 'due') {
      text = `Due ${format(span.start)}`;
    } else if (keys.length > 0) {
      text = keys.length > 1 ? `${keys[0]} – ${keys[keys.length - 1]}` : keys[0];
    } else {
      const days = workDaysBetween(span.start, span.end);
      const range = span.start === span.end ? format(span.start) : `${format(span.start)} – ${format(span.end)}`;
      text = `${range} · ${days} working ${days === 1 ? 'day' : 'days'}`;
    }
    return {text, at: pending.at};
  }, [pending, format]);

  const confirm = pending?.confirm
    ? {
      title: pending.confirm.title,
      lines: pending.confirm.edit.lines,
      at: pending.at,
      onApply: apply,
      onCancel: cancel,
      ...(pending.target.create && (pending.choices ?? choices).length > 1
        ? {choices: pending.choices ?? choices, choice: keyOfLevel(pending.target.level), onChoose: choose}
        : {})
    }
    : null;

  return {rowEdit, startDraw, dragging: pending !== null, dragLabel, confirm};
};
