import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {FieldSelect} from '@/common/components/FieldSelect';
import {SortableValueList} from '@/common/components/SortableValueList';
import {ValuePill} from '@/common/components/ValuePill';
import type {RowConfig, RowSortMode} from '@/common/model/board-config';
import {type FieldUniverse, ROW_FIELD_KINDS} from '../model/fieldUniverse';
import {orderValues} from '../model/sorting';

type Props = {
  universe: FieldUniverse;
  row: RowConfig;
  onChange: (row: RowConfig) => void;
  disabled?: boolean;
  /** Label of the field selector; defaults to "Swimlane field". */
  fieldLabel?: string;
  noneLabel?: string;
  /** Field names that cannot be chosen (the other swimlane level). */
  excludeNames?: string[];
};

const SORT_ITEMS: SelectItem[] = [
  {key: 'custom', label: 'Custom order'},
  {key: 'alphabetical', label: 'Alphabetical, ascending (A to Z)'},
  {key: 'alphabetical-desc', label: 'Alphabetical, descending (Z to A)'},
  {key: 'numerical', label: 'Numerical, ascending'},
  {key: 'numerical-desc', label: 'Numerical, descending'}
];

export const RowsEditor: React.FC<Props> = ({universe, row, onChange, disabled, fieldLabel = 'Swimlane field', noneLabel = 'No swimlanes', excludeNames}) => {
  const field = row.field ? universe.byName.get(row.field.name) : undefined;
  const orderedValues = useMemo(() => {
    const values = field?.values ?? [];
    return orderValues(values, 'custom', row.customOrder);
  }, [field, row.customOrder]);

  return (
    <div className="rows-editor">
      <div className="settings-field">
        <span className="settings-field__label">{fieldLabel}</span>
        <FieldSelect
          universe={universe}
          kinds={ROW_FIELD_KINDS}
          singleOnly
          allowNone
          noneLabel={noneLabel}
          excludeNames={excludeNames}
          value={row.field}
          disabled={disabled}
          onChange={fieldRef => {
            const values = fieldRef ? (universe.byName.get(fieldRef.name)?.values ?? []) : [];
            const sort: RowSortMode = fieldRef?.kind === 'integer' ? 'numerical' : 'custom';
            onChange({field: fieldRef, sort, customOrder: values.map(v => v.key)});
          }}
        />
      </div>
      {row.field && (
        <div className="settings-field">
          <span className="settings-field__label">Sort swimlanes</span>
          <Select
            type={Select.Type.BUTTON}
            disabled={disabled}
            data={SORT_ITEMS}
            selected={SORT_ITEMS.find(item => item.key === row.sort) ?? SORT_ITEMS[0]}
            onChange={(item: SelectItem | null) => item && onChange({...row, sort: item.key as RowSortMode})}
          />
        </div>
      )}
      {row.field && row.sort === 'custom' && (
        <div className="settings-field">
          <span className="settings-field__label">Swimlane order</span>
          {orderedValues.length > 0 ? (
            <SortableValueList
              items={orderedValues.map(v => ({id: v.key, label: <ValuePill label={v.label} color={v.color}/>}))}
              disabled={disabled}
              onReorder={ids => onChange({...row, customOrder: ids})}
            />
          ) : (
            <span className="settings-field__help">
              Values of this field are discovered from the issues on the board; swimlanes not listed here are appended in alphabetical order.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
