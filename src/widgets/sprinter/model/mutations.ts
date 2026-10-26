import {type BoardConfig, type ColumnConfig, type FieldRef, UNCATEGORIZED_ROW_KEY} from '@/common/model/board-config';
import type {FieldValue} from '@/common/youtrack/fields';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {Placement} from './layout';

export type FieldChange = {
  field: FieldRef;
  valueKey: string | null;
};

export type MovePlan = {
  changes: FieldChange[];
  /** Set when the target column has several values and the user must pick one. */
  pickColumn?: ColumnConfig;
};

export type MoveTarget = Pick<Placement, 'rowKey' | 'columnId'>;

/** Determines which field changes a drag from one cell to another implies. */
export const planMove = (config: BoardConfig, from: MoveTarget, to: MoveTarget): MovePlan => {
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
  if (from.rowKey !== to.rowKey && config.row.field) {
    changes.push({field: config.row.field, valueKey: to.rowKey === UNCATEGORIZED_ROW_KEY ? null : to.rowKey});
  }
  return {changes, ...(pickColumn ? {pickColumn} : {})};
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
