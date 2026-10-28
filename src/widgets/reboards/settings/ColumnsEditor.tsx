import React, {useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import addIcon from '@jetbrains/icons/add';
import {SortableValueList} from '@/common/components/SortableValueList';
import {ValuePill} from '@/common/components/ValuePill';
import {type ColumnConfig, generateId} from '@/common/model/board-config';
import type {FieldUniverse, UniverseValue} from '../model/fieldUniverse';

type Props = {
  fieldName: string;
  universe: FieldUniverse;
  columns: ColumnConfig[];
  ignoredValues: string[];
  onChange: (columns: ColumnConfig[], ignoredValues: string[]) => void;
  disabled?: boolean;
};

type ColumnItem = {id: string; label: string; column: ColumnConfig};

const toItem = (value: UniverseValue): SelectItem => ({key: value.key, label: value.label});

export const ColumnsEditor: React.FC<Props> = ({fieldName, universe, columns, ignoredValues, onChange, disabled}) => {
  const allValues = useMemo(() => universe.byName.get(fieldName)?.values ?? [], [universe, fieldName]);
  const valueByKey = useMemo(() => new Map(allValues.map(v => [v.key, v])), [allValues]);
  const used = useMemo(() => new Set(columns.flatMap(c => c.values)), [columns]);
  const unassigned = useMemo(
    () => allValues.filter(v => !used.has(v.key) && !ignoredValues.includes(v.key)),
    [allValues, used, ignoredValues]
  );
  const items = useMemo<ColumnItem[]>(() => columns.map(c => ({id: c.id, label: c.values.join(' / '), column: c})), [columns]);

  const updateColumn = (id: string, patch: Partial<ColumnConfig>) =>
    onChange(columns.map(c => (c.id === id ? {...c, ...patch} : c)), ignoredValues);

  const availableFor = (column: ColumnConfig): SelectItem[] =>
    allValues
      .filter(v => column.values.includes(v.key) || (!used.has(v.key) && !ignoredValues.includes(v.key)))
      .map(toItem);

  const renderColumn = (item: ColumnItem) => (
    <div className="columns-editor__row">
      <Select
        multiple
        type={Select.Type.BUTTON}
        label="Values"
        filter
        disabled={disabled}
        data={availableFor(item.column)}
        selected={item.column.values.map(v => ({key: v, label: valueByKey.get(v)?.label ?? v}))}
        onChange={selected => updateColumn(item.id, {values: selected.map(s => String(s.key))})}
      />
      <span className="columns-editor__pills">
        {item.column.values.map(v => <ValuePill key={v} label={valueByKey.get(v)?.label ?? v} color={valueByKey.get(v)?.color}/>)}
      </span>
      <Input
        size={Size.S}
        placeholder="Column name (optional)"
        value={item.column.name ?? ''}
        disabled={disabled}
        onChange={event => updateColumn(item.id, {name: event.target.value || undefined})}
      />
    </div>
  );

  return (
    <div className="columns-editor">
      <SortableValueList
        items={items}
        disabled={disabled}
        renderItem={renderColumn}
        onReorder={ids => onChange(ids.map(id => columns.find(c => c.id === id)).filter((c): c is ColumnConfig => Boolean(c)), ignoredValues)}
        onRemove={id => onChange(columns.filter(c => c.id !== id), ignoredValues)}
        emptyMessage="No columns yet. Add one below."
      />
      <div className="settings-actions">
        <Button icon={addIcon} disabled={disabled} onClick={() => onChange([...columns, {id: generateId(), values: []}], ignoredValues)}>
          Add column
        </Button>
        {unassigned.length > 0 && (
          <Button
            disabled={disabled}
            onClick={() => onChange([...columns, ...unassigned.map(v => ({id: generateId(), values: [v.key]}))], ignoredValues)}
          >
            {`Add a column for each unassigned value (${unassigned.length})`}
          </Button>
        )}
      </div>
      {unassigned.length > 0 && (
        <p className="settings-hint">
          {'Not shown on the board: '}
          {unassigned.map(v => <ValuePill key={v.key} label={v.label} color={v.color} className="settings-hint__pill"/>)}
        </p>
      )}
      <div className="settings-field">
        <span className="settings-field__label">Ignored values</span>
        <Select
          multiple
          type={Select.Type.BUTTON}
          label="None"
          filter
          disabled={disabled}
          data={allValues.filter(v => !used.has(v.key) || ignoredValues.includes(v.key)).map(toItem)}
          selected={ignoredValues.map(v => ({key: v, label: valueByKey.get(v)?.label ?? v}))}
          onChange={selected => onChange(columns, selected.map(s => String(s.key)))}
        />
        <span className="settings-field__help">Issues with an ignored value are not shown on the board.</span>
      </div>
    </div>
  );
};
