import {type BoardConfig, UNCATEGORIZED_ROW_KEY} from '@/common/model/board-config';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutGroup, LayoutRow} from './layout';
import {type FieldChange, type MoveTarget, type RowsByKey, planMove} from './mutations';

const valueLabel = (universe: FieldUniverse, fieldName: string, key: string | null): string => {
  if (key === null) {
    return 'empty';
  }
  return universe.byName.get(fieldName)?.values.find(v => v.key === key)?.label ?? key;
};

const describeChange = (universe: FieldUniverse, change: FieldChange): string =>
  `${change.field.name} to ${valueLabel(universe, change.field.name, change.valueKey)}`;

/** Text shown while an issue card is dragged over a cell. */
export const issueDragHint = (
  board: BoardConfig,
  universe: FieldUniverse,
  issue: BoardIssue,
  from: MoveTarget,
  target: MoveTarget | null,
  rowsByKey: RowsByKey = {}
): string => {
  if (!target) {
    return `Drop ${issue.idReadable} on a cell`;
  }
  const plan = planMove(board, from, target, rowsByKey);
  const parts = plan.changes.map(change => describeChange(universe, change));
  if (plan.pickInnerValue && board.innerRow?.field) {
    parts.push(`${board.innerRow.field.name} to a value you choose on drop`);
  }
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
  innerFieldName: string | null = null
): string => {
  const what = group.parentInThisRow
    ? `${group.parentIdReadable} and its ${subtaskCount} subtasks`
    : `${subtaskCount} subtasks of ${group.parentIdReadable}`;
  if (!target || target.rowKey === group.rowKey) {
    return `Drop on another swimlane to move ${what}`;
  }
  const targetRow = rows.find(r => r.key === target.rowKey);
  if (targetRow?.kind === 'picker') {
    const outerLabel = targetRow.fullLabel.replace(/ \/ …$/u, '');
    return `Move ${what} to ${outerLabel}, choosing the ${innerFieldName ?? 'swimlane'} on drop`;
  }
  return `Move ${what} to ${rowLabel(rows, target.rowKey)} swimlane`;
};
