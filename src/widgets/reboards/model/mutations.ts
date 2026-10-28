import {type BoardConfig, type ColumnConfig, type FieldRef, UNCATEGORIZED_ROW_KEY} from '@/common/model/board-config';
import type {FieldValue} from '@/common/youtrack/fields';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutRow, Placement} from './layout';

export type FieldChange = {
  field: FieldRef;
  valueKey: string | null;
};

export type MovePlan = {
  changes: FieldChange[];
  /** Set when the target column has several values and the user must pick one. */
  pickColumn?: ColumnConfig;
  /** Set when the target is a picker row and the user must pick the second swimlane value. */
  pickInnerValue?: boolean;
};

export type MoveTarget = Pick<Placement, 'rowKey' | 'columnId'>;

export type RowsByKey = Record<string, LayoutRow>;

export type RowPlan = Pick<MovePlan, 'changes' | 'pickInnerValue'>;

/** Field changes implied by moving from one swimlane to another (both levels). */
export const planRowChanges = (config: BoardConfig, fromRowKey: string, toRowKey: string, rowsByKey: RowsByKey): RowPlan => {
  const changes: FieldChange[] = [];
  if (fromRowKey === toRowKey) {
    return {changes};
  }
  const fromRow = rowsByKey[fromRowKey];
  const toRow = rowsByKey[toRowKey];
  if (!fromRow || !toRow) {
    // Unknown rows (single-level fallback): the key is the value itself.
    if (config.row.field && !toRow) {
      changes.push({field: config.row.field, valueKey: toRowKey === UNCATEGORIZED_ROW_KEY ? null : toRowKey});
    }
    return {changes};
  }
  if (config.row.field && fromRow.outerValue !== toRow.outerValue) {
    changes.push({field: config.row.field, valueKey: toRow.outerValue});
  }
  if (toRow.kind === 'picker') {
    return {changes, pickInnerValue: true};
  }
  if (config.innerRow?.field && fromRow.innerValue !== toRow.innerValue) {
    changes.push({field: config.innerRow.field, valueKey: toRow.innerValue});
  }
  return {changes};
};

/** Determines which field changes a drag from one cell to another implies. */
export const planMove = (config: BoardConfig, from: MoveTarget, to: MoveTarget, rowsByKey: RowsByKey = {}): MovePlan => {
  const changes: FieldChange[] = [];
  let pickColumn: ColumnConfig | undefined;
  if (from.columnId !== to.columnId) {
    const column = config.columns.find(c => c.id === to.columnId);
    if (column) {
      if (column.values.length === 1) {
        changes.push({field: config.columnField, valueKey: column.values[0]});
      } else if (column.values.length > 1) {
        pickColumn = column;
      }
    }
  }
  const rowPlan = planRowChanges(config, from.rowKey, to.rowKey, rowsByKey);
  changes.push(...rowPlan.changes);
  return {changes, ...(pickColumn ? {pickColumn} : {}), ...(rowPlan.pickInnerValue ? {pickInnerValue: true} : {})};
};

/** Produces the FieldValue a change would yield, using universe metadata when available. */
export const localFieldValue = (issue: BoardIssue, change: FieldChange, universe: FieldUniverse): FieldValue | null => {
  if (change.valueKey === null) {
    return null;
  }
  const current = issue.fields[change.field.name];
  const known = universe.byName.get(change.field.name)?.values.find(v => v.key === change.valueKey);
  return {
    $type: current?.$type ?? '',
    key: change.valueKey,
    label: known?.label ?? change.valueKey,
    labels: [known?.label ?? change.valueKey],
    ...(known?.color ? {color: known.color} : {}),
    ...(known?.isResolved !== undefined ? {isResolved: known.isResolved} : {}),
    ...(known?.avatarUrl ? {avatarUrl: known.avatarUrl} : {})
  };
};

export const applyChanges = (issue: BoardIssue, changes: FieldChange[], universe: FieldUniverse): BoardIssue => {
  const fields = {...issue.fields};
  changes.forEach(change => {
    fields[change.field.name] = localFieldValue(issue, change, universe);
  });
  return {...issue, fields};
};
