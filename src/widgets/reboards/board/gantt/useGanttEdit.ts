import {useCallback, useMemo, useState} from 'react';
import {type GanttConfig, isDateKind} from '@/common/model/board-config';
import type {FieldUniverse} from '../../model/fieldUniverse';
import type {GanttIssueRow, GanttRow, Span} from '../../model/gantt';
import {type DragTarget, type Edit, type FieldEdit, draggedSpan, dueEdit, levelHandles, planEdit, snapToSprints, sprintsOf} from '../../model/ganttEdit';
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

/** A drag in progress, or a dropped one waiting for Apply or Cancel. */
type Pending = {
  target: DragTarget;
  issue: BoardIssue;
  span: Span;
  keys: string[];
  at: DragPoint;
  confirm: {title: string; edit: Edit} | null;
};

const NO_EDITS: Edit = {edits: [], lines: []};

/**
 * Rescheduling in the Gantt chart: dragging a planning level's edges or body, or the due
 * diamond, shows where it would go; dropping asks to confirm the changed fields, and Apply saves.
 */
export const useGanttEdit = ({gantt, rows, universe, canEdit, onSave, container, listWidth, pxPerDay}: Options) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const format = useDateFormat();
  const issues = useMemo(() => new Map(rows.flatMap(row => (row.type === 'issue' ? [[row.issue.id, row.issue] as const] : []))), [rows]);

  /** Where a drag by whole days takes the bar, snapped to sprints for a version field. */
  const resolve = useCallback((target: DragTarget, before: Span, deltaDays: number): {span: Span; keys: string[]} => {
    if (target.level === 'due') {
      return {span: {start: before.start + deltaDays * MS_PER_DAY, end: before.start + deltaDays * MS_PER_DAY}, keys: []};
    }
    const level = gantt.levels[target.level];
    const dragged = draggedSpan(before, target.handle, deltaDays);
    if (level?.source !== 'version' || !level.field) {
      return {span: dragged, keys: []};
    }
    const current = issues.get(target.issueId)?.fields[level.field.name]?.keys ?? [];
    const multi = Boolean(universe.byName.get(level.field.name)?.multi);
    return snapToSprints(dragged, before, target.handle, sprintsOf(level.field.name, universe, current), multi) ?? {span: before, keys: current};
  }, [gantt.levels, issues, universe]);

  const editOf = useCallback((target: DragTarget, issue: BoardIssue, span: Span, keys: string[]): {title: string; edit: Edit} => {
    if (target.level === 'due') {
      return {title: `Change the due date of ${issue.idReadable}`, edit: gantt.dueField ? dueEdit(issue, gantt.dueField, span.start, universe, format) : NO_EDITS};
    }
    const level = gantt.levels[target.level];
    return {title: `Change ${level?.name ?? 'the plan'} of ${issue.idReadable}`, edit: level ? planEdit(issue, level, target.handle, span, universe, format, keys) : NO_EDITS};
  }, [gantt.levels, gantt.dueField, universe, format]);

  const {grab} = useBarDrag({
    container,
    listWidth,
    pxPerDay,
    onPreview: (target, before, deltaDays, at) => {
      const issue = issues.get(target.issueId);
      if (issue) {
        setPending({target, issue, ...resolve(target, before, deltaDays), at, confirm: null});
      }
    },
    onDrop: at => setPending(current => {
      if (!current) {
        return null;
      }
      const confirm = editOf(current.target, current.issue, current.span, current.keys);
      // Dropped where it was: nothing to confirm.
      return confirm.edit.edits.length > 0 ? {...current, at, confirm} : null;
    }),
    onCancel: () => setPending(null)
  });

  const cancel = useCallback(() => setPending(null), []);
  const apply = useCallback(() => {
    if (!pending?.confirm) {
      return;
    }
    const {issue, confirm} = pending;
    setPending(null);
    setSaving(current => new Set(current).add(issue.id));
    onSave(issue, confirm.edit.edits).finally(() => setSaving(current => {
      const next = new Set(current);
      next.delete(issue.id);
      return next;
    }));
  }, [pending, onSave]);

  const editableDue = Boolean(gantt.dueField && isDateKind(universe.byName.get(gantt.dueField.name)?.kind ?? gantt.dueField.kind));
  const names = useMemo(() => gantt.levels.map(level => level.name), [gantt.levels]);
  const handlesByLevel = useMemo(() => gantt.levels.map(level => levelHandles(level, universe)), [gantt.levels, universe]);

  /** What can be dragged on each row the user may change. */
  const rowEdits = useMemo(() => {
    const edits = new Map<string, RowEdit>();
    rows.forEach(row => {
      if (row.type !== 'issue' || !row.timed || !canEdit(row.issue)) {
        return;
      }
      const id = row.issue.id;
      edits.set(id, {
        handles: handlesByLevel.map((handles, index) => (row.schedule.spans[index] ? handles : [])),
        names,
        due: editableDue && row.schedule.due !== undefined,
        pending: pending?.target.issueId === id ? {level: pending.target.level, span: pending.span} : null,
        saving: saving.has(id),
        onGrab: grab
      });
    });
    return edits;
  }, [rows, canEdit, handlesByLevel, names, editableDue, pending, saving, grab]);

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

  return {
    rowEdit,
    dragging: pending !== null,
    dragLabel,
    confirm: pending?.confirm ? {title: pending.confirm.title, lines: pending.confirm.edit.lines, at: pending.at, onApply: apply, onCancel: cancel} : null
  };
};
