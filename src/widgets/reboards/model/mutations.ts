import {type BoardConfig, type ColumnConfig, type FieldRef, UNCATEGORIZED_ROW_KEY} from '@/common/model/board-config';
import type {FieldValue} from '@/common/youtrack/fields';
import type {FieldUniverse} from './fieldUniverse';
import type {BoardIssue} from './issue';
import type {LayoutColumn, LayoutRow, Placement} from './layout';

export type FieldChange = {
  field: FieldRef;
  valueKey: string | null;
  /**
   * The value the card is dragged away from, when the drag starts in a value's column or swimlane
   * (null: the "No <field>" lane). A multi-value field then swaps that one value for `valueKey`
   * and keeps the others; single-value fields ignore it.
   */
  replaceKey?: string | null;
};

/** The keys a field has after a change; `multi` tells whether the field holds several values. */
export const nextKeys = (current: string[], change: FieldChange, multi: boolean): string[] => {
  if (!multi || change.replaceKey === undefined) {
    return change.valueKey === null ? [] : [change.valueKey];
  }
  const kept = change.replaceKey === null ? current : current.filter(key => key !== change.replaceKey);
  return change.valueKey === null || kept.includes(change.valueKey) ? kept : [...kept, change.valueKey];
};

/** A field value the user picks on drop (an "Assign…" column or picker row); multi-value fields swap `replaceKey` for it. */
export type ValueChoice = {
  field: FieldRef;
  replaceKey?: string | null;
};

export type MovePlan = {
  changes: FieldChange[];
  /** Set when the target column has several values and the user must pick one. */
  pickColumn?: ColumnConfig;
  /** Values the user picks after the drop, in order: the column field first, then the swimlane field. */
  choices?: ValueChoice[];
};

export type MoveTarget = Pick<Placement, 'rowKey' | 'columnId'>;

export type RowsByKey = Record<string, LayoutRow>;

export type RowPlan = Pick<MovePlan, 'changes' | 'choices'>;

/** Asks for the value of the level of a picker row, swapping the source row's value of a multi-value field. */
const pickerChoices = (config: BoardConfig, fromRow: LayoutRow, toRow: LayoutRow): ValueChoice[] => {
  const outer = toRow.pickLevel === 'outer';
  const field = outer ? config.row.field : config.innerRow?.field;
  return field ? [{field, replaceKey: outer ? fromRow.outerValue : fromRow.innerValue}] : [];
};

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
  if (toRow.kind === 'picker' && toRow.pickLevel === 'outer') {
    // "Assign <field>…" of a dynamic first-level field: the second level stays.
    return {changes, choices: pickerChoices(config, fromRow, toRow)};
  }
  if (config.row.field && fromRow.outerValue !== toRow.outerValue) {
    changes.push({field: config.row.field, valueKey: toRow.outerValue, replaceKey: fromRow.outerValue});
  }
  if (toRow.kind === 'picker') {
    return {changes, choices: pickerChoices(config, fromRow, toRow)};
  }
  if (config.innerRow?.field && fromRow.innerValue !== toRow.innerValue) {
    changes.push({field: config.innerRow.field, valueKey: toRow.innerValue, replaceKey: fromRow.innerValue});
  }
  return {changes};
};

type TargetColumn = Pick<LayoutColumn, 'id' | 'values' | 'columnKey' | 'assign'> & {name?: string};

type ColumnPlan = Pick<MovePlan, 'pickColumn' | 'choices'> & {change?: FieldChange};

/** What moving to another column implies: a field change, a value to pick among the column's, or one to pick freely. */
const planColumnMove = (config: BoardConfig, fromId: string, toId: string, columns: TargetColumn[]): ColumnPlan => {
  const column = columns.find(c => c.id === toId);
  // Dynamic columns name the value the card leaves, so multi-value fields swap just that one.
  const fromKey = columns.find(c => c.id === fromId)?.columnKey;
  const replace = fromKey === undefined ? {} : {replaceKey: fromKey};
  if (!column) {
    return {};
  }
  if (column.assign) {
    return {choices: [{field: config.columnField, ...replace}]};
  }
  if (column.columnKey === null) {
    // The "No <field>" column of a dynamic field.
    return {change: {field: config.columnField, valueKey: null, ...replace}};
  }
  if (column.values.length === 1) {
    return {change: {field: config.columnField, valueKey: column.values[0], ...replace}};
  }
  return column.values.length > 1 ? {pickColumn: {id: column.id, values: column.values, ...(column.name ? {name: column.name} : {})}} : {};
};

/**
 * Determines which field changes a drag from one cell to another implies.
 * `columns` are the rendered columns; dynamic fields (user, version, build) only exist there.
 */
export const planMove = (config: BoardConfig, from: MoveTarget, to: MoveTarget, rowsByKey: RowsByKey = {}, columns?: TargetColumn[]): MovePlan => {
  const column = from.columnId === to.columnId ? {} : planColumnMove(config, from.columnId, to.columnId, columns ?? config.columns);
  const rowPlan = planRowChanges(config, from.rowKey, to.rowKey, rowsByKey);
  const changes = [...(column.change ? [column.change] : []), ...rowPlan.changes];
  const choices = [...(column.choices ?? []), ...(rowPlan.choices ?? [])];
  return {changes, ...(column.pickColumn ? {pickColumn: column.pickColumn} : {}), ...(choices.length > 0 ? {choices} : {})};
};

/** The keys a field of the issue has after the change. */
export const keysAfter = (issue: BoardIssue, change: FieldChange, universe: FieldUniverse): string[] =>
  nextKeys(issue.fields[change.field.name]?.keys ?? [], change, universe.byName.get(change.field.name)?.multi ?? false);

/** Produces the FieldValue a change would yield, using universe metadata when available. */
export const localFieldValue = (issue: BoardIssue, change: FieldChange, universe: FieldUniverse): FieldValue | null => {
  const keys = keysAfter(issue, change, universe);
  if (keys.length === 0) {
    return null;
  }
  const current = issue.fields[change.field.name];
  const values = universe.byName.get(change.field.name)?.values ?? [];
  const labelOf = (key: string): string => values.find(v => v.key === key)?.label ?? current?.labels[current.keys.indexOf(key)] ?? key;
  const known = values.find(v => v.key === keys[0]);
  return {
    $type: current?.$type ?? '',
    key: keys[0],
    label: labelOf(keys[0]),
    labels: keys.map(labelOf),
    keys,
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
