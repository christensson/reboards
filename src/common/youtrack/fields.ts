import type {FieldKind} from '@/common/model/board-config';
import type {YtColor, YtFieldValueObject, YtIssueCustomField} from './types';

export type FieldTypeInfo = {
  kind: FieldKind | 'other';
  multi: boolean;
};

/** Classifies a YouTrack field type id such as `enum[1]`, `version[*]`, `user[1]`, `integer`, `date and time`. */
export const describeFieldType = (typeId: string): FieldTypeInfo => {
  // The only type id with a space, which the pattern below does not take.
  if (typeId === 'date and time') {
    return {kind: 'datetime', multi: false};
  }
  const match = typeId.match(/^([a-zA-Z]+)(?:\[(\*|1)\])?$/);
  if (!match) {
    return {kind: 'other', multi: false};
  }
  const base = match[1];
  const multi = match[2] === '*';
  switch (base) {
    case 'enum':
    case 'ownedField':
      return {kind: 'enum', multi};
    case 'state':
      return {kind: 'state', multi};
    case 'version':
      return {kind: 'version', multi};
    case 'build':
      return {kind: 'build', multi};
    case 'user':
      return {kind: 'user', multi};
    case 'integer':
      return {kind: 'integer', multi: false};
    case 'date':
      return {kind: 'date', multi: false};
    case 'period':
      return {kind: 'period', multi: false};
    default:
      return {kind: 'other', multi};
  }
};

/** A normalized single field value as used by the board model. */
export type FieldValue = {
  /** REST $type of the issue custom field, reused when sending updates. */
  $type: string;
  /** Comparable key: value name, user login, or stringified number. */
  key: string;
  /** Human readable label. */
  label: string;
  color?: YtColor;
  isResolved?: boolean;
  avatarUrl?: string;
  /** For multi-value fields: all labels; otherwise [label]. */
  labels: string[];
  /** For multi-value fields: all keys, in field order; otherwise [key]. */
  keys: string[];
  /** Period fields: the duration in minutes. */
  minutes?: number;
};

const objectValue = (value: YtFieldValueObject): {key: string; label: string; color?: YtColor; isResolved?: boolean; avatarUrl?: string} => {
  if (value.login !== undefined) {
    return {key: value.login, label: value.fullName || value.login, avatarUrl: value.avatarUrl};
  }
  const label = value.name ?? value.presentation ?? value.id ?? '';
  return {
    key: label,
    label,
    ...(value.color ? {color: value.color} : {}),
    ...(value.isResolved !== undefined ? {isResolved: value.isResolved} : {})
  };
};

/** Converts a REST issue custom field into a FieldValue, or null when unset. */
export const toFieldValue = (field: YtIssueCustomField): FieldValue | null => {
  const {value} = field;
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const text = String(value);
    return {$type: field.$type, key: text, label: text, labels: [text], keys: [text]};
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    const first = objectValue(value[0]);
    const all = value.map(objectValue);
    return {$type: field.$type, ...first, labels: all.map(v => v.label), keys: all.map(v => v.key)};
  }
  const single = objectValue(value);
  const minutes = typeof value.minutes === 'number' ? {minutes: value.minutes} : {};
  return {$type: field.$type, ...single, labels: [single.label], keys: [single.key], ...minutes};
};

const DEFAULT_ISSUE_FIELD_TYPES: Record<FieldKind, string> = {
  enum: 'SingleEnumIssueCustomField',
  state: 'StateIssueCustomField',
  version: 'SingleVersionIssueCustomField',
  build: 'SingleBuildIssueCustomField',
  user: 'SingleUserIssueCustomField',
  integer: 'SimpleIssueCustomField',
  date: 'DateIssueCustomField',
  datetime: 'DateIssueCustomField',
  period: 'PeriodIssueCustomField'
};

type ValueRef = {name: string} | {login: string};

export type IssueFieldUpdate = {
  name: string;
  $type: string;
  value: ValueRef | ValueRef[] | number | null;
};

const MULTI_ISSUE_FIELD_TYPES: Partial<Record<FieldKind, string>> = {
  enum: 'MultiEnumIssueCustomField',
  version: 'MultiVersionIssueCustomField',
  build: 'MultiBuildIssueCustomField',
  user: 'MultiUserIssueCustomField'
};

const valueRef = (kind: FieldKind, key: string): ValueRef => (kind === 'user' ? {login: key} : {name: key});

/** The custom field entry of an issue update that sets every value of a multi-value field. */
export const buildMultiFieldUpdate = (name: string, kind: FieldKind, currentType: string | undefined, keys: string[]): IssueFieldUpdate => ({
  name,
  $type: currentType || MULTI_ISSUE_FIELD_TYPES[kind] || DEFAULT_ISSUE_FIELD_TYPES[kind],
  value: keys.map(key => valueRef(kind, key))
});

/** Builds the custom field entry of an issue update body for the given kind and value key. */
export const buildFieldUpdate = (
  name: string,
  kind: FieldKind,
  currentType: string | undefined,
  valueKey: string | null
): IssueFieldUpdate => {
  const $type = currentType || DEFAULT_ISSUE_FIELD_TYPES[kind];
  if (valueKey === null) {
    return {name, $type, value: null};
  }
  // Numbers and dates (epoch milliseconds) are sent as numbers.
  if (kind === 'integer' || kind === 'date' || kind === 'datetime') {
    return {name, $type, value: Number(valueKey)};
  }
  return {name, $type, value: valueRef(kind, valueKey)};
};
