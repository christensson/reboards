import {type BoardConfig, type DynamicOptions, type FieldRef, type RowConfig, columnLabel, isDynamicField} from './board-config';

/** Value keys of an issue's fields, by field name; empty or missing for an unset field. */
export type FieldValues = Record<string, string[]>;

/** Where an issue shows on a board, by column and swimlane names. Multi-value fields can put it in several. */
export type IssuePlacement = {
  columns: string[];
  swimlanes: string[] | null;
  innerSwimlanes: string[] | null;
};

/** The label of the lane for issues without a value, as on the board. */
const noValue = (field: FieldRef): string => `No ${field.name}`;

/** Lanes of a field whose lanes are its values (user, version, build, or an enum treated so). */
const valueLanes = (field: FieldRef, values: FieldValues): string[] => {
  const keys = values[field.name] ?? [];
  return keys.length > 0 ? keys : [noValue(field)];
};

const columnsOf = (config: BoardConfig, values: FieldValues): string[] => {
  const field = config.columnField;
  if (!field) {
    return ['All issues'];
  }
  if (isDynamicField(field.kind, config.columnOptions)) {
    return valueLanes(field, values);
  }
  const ignored = new Set(config.ignoredValues);
  const keys = (values[field.name] ?? []).filter(key => !ignored.has(key));
  return config.columns.filter(column => column.values.some(value => keys.includes(value))).map(columnLabel);
};

const lanesOf = (row: RowConfig | null, values: FieldValues): string[] | null => {
  const field = row?.field;
  if (!row || !field) {
    return null;
  }
  const dynamic: DynamicOptions = row.dynamic;
  if (isDynamicField(field.kind, dynamic)) {
    return valueLanes(field, values);
  }
  const keys = values[field.name] ?? [];
  return keys.length > 0 ? keys : ['Uncategorized'];
};

/**
 * The columns and swimlanes an issue shows in, worked out from its field values with the board's
 * rules: configured columns group values, other fields make a lane per value. No columns means the
 * issue is hidden on the board (its value is in no column, or is ignored).
 */
export const placeIssue = (config: BoardConfig, values: FieldValues): IssuePlacement => {
  const swimlanes = config.row.field ? lanesOf(config.row, values) : null;
  return {
    columns: columnsOf(config, values),
    swimlanes,
    innerSwimlanes: swimlanes ? lanesOf(config.innerRow, values) : null
  };
};
