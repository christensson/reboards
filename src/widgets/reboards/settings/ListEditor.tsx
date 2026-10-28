import React, {type ReactNode, useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {SortableValueList} from '@/common/components/SortableValueList';

type Props = {
  values: string[];
  options: {key: string; label: string; description?: string}[];
  onChange: (values: string[]) => void;
  addLabel: string;
  renderValue?: (value: string) => ReactNode;
  disabled?: boolean;
  emptyMessage?: string;
};

/** Ordered list of string values with an "add from available" select. */
export const ListEditor: React.FC<Props> = ({values, options, onChange, addLabel, renderValue, disabled, emptyMessage}) => {
  const available = useMemo<SelectItem[]>(
    () => options.filter(o => !values.includes(o.key)).map(o => ({key: o.key, label: o.label, description: o.description})),
    [options, values]
  );
  const labelOf = (value: string): string => options.find(o => o.key === value)?.label ?? value;
  return (
    <div className="list-editor">
      <SortableValueList
        items={values.map(v => ({id: v, label: renderValue ? renderValue(v) : labelOf(v)}))}
        disabled={disabled}
        onReorder={onChange}
        onRemove={value => onChange(values.filter(v => v !== value))}
        emptyMessage={emptyMessage}
      />
      <div className="settings-actions">
        <Select
          type={Select.Type.BUTTON}
          label={addLabel}
          filter
          disabled={disabled || available.length === 0}
          data={available}
          selected={null}
          onChange={(item: SelectItem | null) => item && onChange([...values, String(item.key)])}
        />
      </div>
    </div>
  );
};
