import type {BoardConfig, ColumnConfig, FieldKind, FieldRef} from '@/common/model/board-config';
import {describeFieldType} from '@/common/youtrack/fields';
import type {YtColor, YtProjectCustomField} from '@/common/youtrack/types';

export type UniverseValue = {
  key: string;
  label: string;
  ordinal: number;
  color?: YtColor;
  isResolved?: boolean;
  avatarUrl?: string;
};

export type ResolvedField = {
  name: string;
  kind: FieldKind | 'other';
  multi: boolean;
  typeId: string;
  /** Number of board projects that have this field. */
  projectsCount: number;
  /** True when projects disagree on the field type. */
  inconsistent: boolean;
  /** True when the field may be unset in at least one of the projects. */
  canBeEmpty: boolean;
  values: UniverseValue[];
};

export type FieldUniverse = {
  fields: ResolvedField[];
  byName: Map<string, ResolvedField>;
  projectCount: number;
};

const bundleValues = (field: YtProjectCustomField): UniverseValue[] => {
  const bundle = field.bundle;
  if (!bundle) {
    return [];
  }
  if (bundle.aggregatedUsers && bundle.aggregatedUsers.length > 0) {
    return bundle.aggregatedUsers.map((u, index) => ({
      key: u.login,
      label: u.fullName || u.login,
      ordinal: index,
      ...(u.avatarUrl ? {avatarUrl: u.avatarUrl} : {})
    }));
  }
  return (bundle.values ?? []).map((v, index) => ({
    key: v.name,
    label: v.name,
    ordinal: v.ordinal ?? index,
    ...(v.color ? {color: v.color} : {}),
    ...(v.isResolved !== undefined ? {isResolved: v.isResolved} : {})
  }));
};

const mergeValues = (into: UniverseValue[], add: UniverseValue[]): void => {
  const seen = new Set(into.map(v => v.key));
  add.forEach(v => {
    if (!seen.has(v.key)) {
      seen.add(v.key);
      into.push({...v, ordinal: into.length});
    }
  });
};

/** Merges the custom fields of several projects by field name. */
export const buildFieldUniverse = (projectFields: YtProjectCustomField[][]): FieldUniverse => {
  const byName = new Map<string, ResolvedField>();
  projectFields.forEach(fields => {
    fields.forEach(pf => {
      const typeId = pf.field.fieldType.id;
      const info = describeFieldType(typeId);
      const existing = byName.get(pf.field.name);
      if (!existing) {
        byName.set(pf.field.name, {
          name: pf.field.name,
          kind: info.kind,
          multi: info.multi,
          typeId,
          projectsCount: 1,
          inconsistent: false,
          canBeEmpty: pf.canBeEmpty !== false,
          values: bundleValues(pf).map((v, index) => ({...v, ordinal: index}))
        });
        return;
      }
      existing.projectsCount += 1;
      existing.canBeEmpty = existing.canBeEmpty || pf.canBeEmpty !== false;
      if (existing.typeId !== typeId) {
        existing.inconsistent = true;
      }
      mergeValues(existing.values, bundleValues(pf));
    });
  });
  const fields = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {fields, byName, projectCount: projectFields.length};
};

export const emptyUniverse = (): FieldUniverse => ({fields: [], byName: new Map(), projectCount: 0});

export type FieldFilter = {
  kinds: FieldKind[];
  singleOnly?: boolean;
};

export const fieldsMatching = (universe: FieldUniverse, filter: FieldFilter): ResolvedField[] =>
  universe.fields.filter(
    f => f.kind !== 'other' && filter.kinds.includes(f.kind) && !f.inconsistent && (!filter.singleOnly || !f.multi)
  );

export const toFieldRef = (field: ResolvedField): FieldRef | null =>
  field.kind === 'other' ? null : {name: field.name, kind: field.kind};

export const COLUMN_FIELD_KINDS: FieldKind[] = ['state', 'enum'];
export const ROW_FIELD_KINDS: FieldKind[] = ['enum', 'version', 'user', 'integer'];
export const SPRINT_FIELD_KINDS: FieldKind[] = ['version', 'enum'];
export const CARD_COLOR_FIELD_KINDS: FieldKind[] = ['enum', 'state'];

/** First state field, else first single enum field. */
export const defaultColumnField = (universe: FieldUniverse): FieldRef | null => {
  const states = fieldsMatching(universe, {kinds: ['state'], singleOnly: true});
  if (states.length > 0) {
    return toFieldRef(states[0]);
  }
  const enums = fieldsMatching(universe, {kinds: ['enum'], singleOnly: true});
  return enums.length > 0 ? toFieldRef(enums[0]) : null;
};

/** Field named Priority if present, else the first single enum field. */
export const defaultRowField = (universe: FieldUniverse): FieldRef | null => {
  const candidates = fieldsMatching(universe, {kinds: ['enum'], singleOnly: true});
  const priority = candidates.find(f => f.name.toLowerCase() === 'priority');
  const chosen = priority ?? candidates[0];
  return chosen ? toFieldRef(chosen) : null;
};

/** One column per value of the field, in bundle order. */
export const defaultColumns = (universe: FieldUniverse, fieldName: string): ColumnConfig[] => {
  const field = universe.byName.get(fieldName);
  return (field?.values ?? []).map((v, index) => ({id: `col-${index}-${v.key}`, values: [v.key]}));
};

/** Applies universe defaults to a freshly created board. */
export const applyUniverseDefaults = (config: BoardConfig, universe: FieldUniverse): BoardConfig => {
  const columnField = defaultColumnField(universe);
  const rowField = defaultRowField(universe);
  return {
    ...config,
    columnField: columnField ?? config.columnField,
    columns: columnField ? defaultColumns(universe, columnField.name) : [],
    row: {
      field: rowField,
      sort: 'custom',
      customOrder: rowField ? (universe.byName.get(rowField.name)?.values ?? []).map(v => v.key) : []
    },
    cardFields: config.cardFields.filter(name => universe.byName.has(name)),
    cardColorField: config.cardColorField && universe.byName.has(config.cardColorField.name) ? config.cardColorField : null
  };
};
