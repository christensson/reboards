import {type BoardConfig, UNCATEGORIZED_ROW_KEY} from '@/common/model/board-config';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutColumn, LayoutGroup, LayoutRow} from './layout';
import type {LinkMode, LinkTargetResult} from './linkTargets';
import {type FieldChange, type MoveTarget, type RowsByKey, planMove} from './mutations';

const valueLabel = (universe: FieldUniverse, fieldName: string, key: string | null): string => {
  if (key === null) {
    return 'empty';
  }
  return universe.byName.get(fieldName)?.values.find(v => v.key === key)?.label ?? key;
};

/** "2026-05-12" at the start of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** Dates are keyed by their epoch milliseconds; show them as dates. */
const changeLabel = (universe: FieldUniverse, change: FieldChange): string => {
  if (change.valueKey !== null && (change.field.kind === 'date' || change.field.kind === 'datetime')) {
    const date = new Date(Number(change.valueKey));
    return change.field.kind === 'date' ? date.toISOString().slice(0, ISO_DATE_LENGTH) : date.toLocaleString();
  }
  return valueLabel(universe, change.field.name, change.valueKey);
};

const describeChange = (universe: FieldUniverse, change: FieldChange): string =>
  `${change.field.name} to ${changeLabel(universe, change)}`;

/** Text shown while an issue card is dragged over a cell. */
export const issueDragHint = (
  board: BoardConfig,
  universe: FieldUniverse,
  issue: BoardIssue,
  from: MoveTarget,
  target: MoveTarget | null,
  rowsByKey: RowsByKey = {},
  columns?: LayoutColumn[]
): string => {
  if (!target) {
    return `Drop ${issue.idReadable} on a cell`;
  }
  const plan = planMove(board, from, target, rowsByKey, columns);
  const parts = plan.changes.map(change => describeChange(universe, change));
  (plan.choices ?? []).forEach(choice => parts.push(`${choice.field.name} to a value you choose on drop`));
  if (plan.pickColumn) {
    const options = plan.pickColumn.values.map(v => valueLabel(universe, board.columnField.name, v)).join(' / ');
    parts.push(`${board.columnField.name} to one of ${options} (choose on drop)`);
  }
  if (parts.length === 0) {
    return `${issue.idReadable}: no change`;
  }
  return `Set ${issue.idReadable} ${parts.join(' and ')}.`;
};

const rowLabel = (rows: LayoutRow[], rowKey: string): string =>
  rows.find(r => r.key === rowKey)?.fullLabel ?? (rowKey === UNCATEGORIZED_ROW_KEY ? 'Uncategorized' : rowKey);

/** Text shown while a parent group is dragged. */
export const groupDragHint = (
  group: LayoutGroup,
  subtaskCount: number,
  rows: LayoutRow[],
  target: MoveTarget | null,
  innerFieldName: string | null = null,
  outerFieldName: string | null = null
): string => {
  const what = group.parentInThisRow
    ? `${group.parentIdReadable} and its ${subtaskCount} subtasks`
    : `${subtaskCount} subtasks of ${group.parentIdReadable}`;
  if (!target || target.rowKey === group.rowKey) {
    return `Drop on another swimlane to move ${what}`;
  }
  const targetRow = rows.find(r => r.key === target.rowKey);
  if (targetRow?.kind === 'picker' && targetRow.pickLevel === 'outer') {
    return `Move ${what} to the ${outerFieldName ?? 'swimlane'} you choose on drop`;
  }
  if (targetRow?.kind === 'picker') {
    const outerLabel = targetRow.fullLabel.replace(/ \/ …$/u, '');
    return `Move ${what} to ${outerLabel}, choosing the ${innerFieldName ?? 'swimlane'} on drop`;
  }
  return `Move ${what} to ${rowLabel(rows, target.rowKey)} swimlane`;
};

/** Text shown while an issue card is dragged with Ctrl (change parent) or Ctrl+Shift (add a relation). */
export const linkDragHint = (mode: Exclude<LinkMode, 'none'>, dragged: BoardIssue, target: LinkTargetResult | null): string => {
  if (!target) {
    return mode === 'parent'
      ? `Drop on an issue or parent group to change the parent of ${dragged.idReadable}`
      : `Drop on an issue or parent group to add a relation to ${dragged.idReadable}`;
  }
  if ('invalid' in target) {
    return target.invalid;
  }
  return mode === 'parent'
    ? `Change parent of ${dragged.idReadable} to ${target.targetLabel}.`
    : `Add a relation between ${dragged.idReadable} and ${target.targetLabel}. You choose the relation on drop.`;
};
