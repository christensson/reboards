import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {FieldSelect} from '@/common/components/FieldSelect';
import {SortableValueList} from '@/common/components/SortableValueList';
import {ValuePill} from '@/common/components/ValuePill';
import {DYNAMIC_KINDS, type FieldRef, type RowConfig, type RowSortMode, canBeDynamic, isDynamicField} from '@/common/model/board-config';
import {type FieldUniverse, ROW_FIELD_KINDS, type UniverseValue} from '../model/fieldUniverse';
import {orderValues} from '../model/sorting';
import {AsDynamicToggle, DynamicOptionsEditor} from './DynamicOptionsEditor';

type Props = {
  universe: FieldUniverse;
  row: RowConfig;
  onChange: (row: RowConfig) => void;
  disabled?: boolean;
  /** Label of the field selector; defaults to "Swimlane field". */
  fieldLabel?: string;
  noneLabel?: string;
  /** Offer "no field"; the first level has none: turning swimlanes off is a layout choice. */
  allowNone?: boolean;
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

type StableProps = {
  row: RowConfig;
  values: UniverseValue[];
  onChange: (row: RowConfig) => void;
  disabled?: boolean;
};

/** Sorting of a stable swimlane field (enum, integer): a sort mode, or a custom order of its values. */
const StableRowOptions: React.FC<StableProps> = ({row, values, onChange, disabled}) => {
  const orderedValues = useMemo(() => orderValues(values, 'custom', row.customOrder), [values, row.customOrder]);
  return (
    <>
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
      {row.sort === 'custom' && (
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
    </>
  );
};

const NO_VALUES: UniverseValue[] = [];

/** The swimlane level after choosing another field: numbers sort numerically, other values start in field order. */
const rowForField = (row: RowConfig, universe: FieldUniverse, fieldRef: FieldRef | null): RowConfig => {
  const values = fieldRef ? (universe.byName.get(fieldRef.name)?.values ?? []) : [];
  const sort: RowSortMode = fieldRef?.kind === 'integer' ? 'numerical' : 'custom';
  return {...row, field: fieldRef, sort, customOrder: values.map(v => v.key), dynamic: {...row.dynamic, asDynamic: false}};
};

export const RowsEditor: React.FC<Props> = ({universe, row, onChange, disabled, fieldLabel = 'Swimlane field', noneLabel = 'No swimlanes', allowNone = true, excludeNames}) => {
  const field = row.field ? universe.byName.get(row.field.name) : undefined;
  const kind = field?.kind ?? row.field?.kind ?? 'other';
  return (
    <div className="rows-editor">
      <div className="settings-field">
        <span className="settings-field__label">{fieldLabel}</span>
        <FieldSelect
          universe={universe}
          kinds={ROW_FIELD_KINDS}
          singleOnly
          multiKinds={DYNAMIC_KINDS}
          allowNone={allowNone}
          noneLabel={noneLabel}
          excludeNames={excludeNames}
          value={row.field}
          disabled={disabled}
          onChange={fieldRef => onChange(rowForField(row, universe, fieldRef))}
        />
      </div>
      {row.field && canBeDynamic(kind) && (
        <AsDynamicToggle
          checked={row.dynamic.asDynamic}
          disabled={disabled}
          onChange={on => onChange({...row, dynamic: {...row.dynamic, asDynamic: on, ...(on ? {sort: 'order' as const} : {})}})}
        />
      )}
      {row.field && (isDynamicField(kind, row.dynamic)
        ? <DynamicOptionsEditor kind={kind} options={row.dynamic} disabled={disabled} onChange={next => onChange({...row, dynamic: next})}/>
        : <StableRowOptions row={row} values={field?.values ?? NO_VALUES} disabled={disabled} onChange={onChange}/>)}
    </div>
  );
};
