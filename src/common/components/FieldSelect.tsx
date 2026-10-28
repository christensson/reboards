import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import type {FieldKind, FieldRef} from '@/common/model/board-config';
import {type FieldUniverse, type ResolvedField, fieldsMatching, toFieldRef} from '@/widgets/reboards/model/fieldUniverse';

type Props = {
  universe: FieldUniverse;
  kinds: FieldKind[];
  singleOnly?: boolean;
  value: FieldRef | null;
  onChange: (field: FieldRef | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  label?: string;
  disabled?: boolean;
  /** Field names left out of the list (e.g. a field already used elsewhere). */
  excludeNames?: string[];
};

const NONE_KEY = '__none__';

const describe = (field: ResolvedField, projectCount: number): string => {
  const parts: string[] = [field.kind];
  if (field.multi) {
    parts.push('multiple values');
  }
  if (projectCount > 1 && field.projectsCount < projectCount) {
    parts.push(`in ${field.projectsCount} of ${projectCount} projects`);
  }
  return parts.join(' · ');
};

/** Select over the fields of the board projects, filtered by field kind. */
export const FieldSelect: React.FC<Props> = ({
  universe,
  kinds,
  singleOnly,
  value,
  onChange,
  allowNone,
  noneLabel = 'None',
  label,
  disabled,
  excludeNames
}) => {
  const data = useMemo<SelectItem[]>(() => {
    const excluded = new Set(excludeNames ?? []);
    const items: SelectItem[] = fieldsMatching(universe, {kinds, singleOnly}).filter(field => !excluded.has(field.name)).map(field => ({
      key: field.name,
      label: field.name,
      description: describe(field, universe.projectCount)
    }));
    if (allowNone) {
      items.unshift({key: NONE_KEY, label: noneLabel});
    }
    return items;
  }, [universe, kinds, singleOnly, allowNone, noneLabel, excludeNames]);

  const selected = useMemo<SelectItem | null>(() => {
    if (!value) {
      return allowNone ? {key: NONE_KEY, label: noneLabel} : null;
    }
    return data.find(item => item.key === value.name) ?? {key: value.name, label: `${value.name} (missing)`};
  }, [value, data, allowNone, noneLabel]);

  return (
    <Select
      type={Select.Type.BUTTON}
      label={label ?? 'Select field'}
      filter
      disabled={disabled}
      data={data}
      selected={selected}
      onChange={(item: SelectItem | null) => {
        if (!item || item.key === NONE_KEY) {
          onChange(null);
          return;
        }
        const field = universe.byName.get(String(item.key));
        onChange(field ? toFieldRef(field) : null);
      }}
    />
  );
};
