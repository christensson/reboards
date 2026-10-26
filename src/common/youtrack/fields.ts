import type {FieldKind} from '@/common/model/board-config';
import type {YtColor, YtFieldValueObject, YtIssueCustomField} from './types';

export type FieldTypeInfo = {
  kind: FieldKind | 'other';
  multi: boolean;
};

/** Classifies a YouTrack field type id such as `enum[1]`, `version[*]`, `user[1]`, `integer`. */
export const describeFieldType = (typeId: string): FieldTypeInfo => {
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
    case 'build':
      return {kind: 'version', multi};
    case 'user':
      return {kind: 'user', multi};
    case 'integer':
      return {kind: 'integer', multi: false};
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
    return {$type: field.$type, key: text, label: text, labels: [text]};
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    const first = objectValue(value[0]);
    return {$type: field.$type, ...first, labels: value.map(v => objectValue(v).label)};
  }
  const single = objectValue(value);
  return {$type: field.$type, ...single, labels: [single.label]};
};

const DEFAULT_ISSUE_FIELD_TYPES: Record<FieldKind, string> = {
  enum: 'SingleEnumIssueCustomField',
  state: 'StateIssueCustomField',
  version: 'SingleVersionIssueCustomField',
  user: 'SingleUserIssueCustomField',
  integer: 'SimpleIssueCustomField'
};

export type IssueFieldUpdate = {
  name: string;
  $type: string;
  value: {name: string} | {login: string} | number | null;
};

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
  if (kind === 'user') {
    return {name, $type, value: {login: valueKey}};
  }
  if (kind === 'integer') {
    return {name, $type, value: Number(valueKey)};
  }
  return {name, $type, value: {name: valueKey}};
};
