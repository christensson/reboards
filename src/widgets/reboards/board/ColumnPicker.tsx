import React, {useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import eyeIcon from '@jetbrains/icons/eye';
import type {AvailableColumn} from '../model/layout';

type Props = {
  columns: AvailableColumn[];
  /** Saves the picked column ids; null goes back to the board's default columns. */
  onChange: (columnIds: string[] | null) => void;
};

/**
 * Turns the columns of a dynamic column field on and off. It sits at the end
 * of the "Assign <field>…" column header; the choice is kept per user and board.
 */
export const ColumnPicker: React.FC<Props> = ({columns, onChange}) => {
  const data = useMemo<SelectItem[]>(() => columns.map(c => ({key: c.id, label: c.label, description: String(c.count)})), [columns]);
  const selected = useMemo(() => data.filter(item => columns.find(c => c.id === item.key)?.visible), [data, columns]);
  const hidden = columns.length - selected.length;
  return (
    <Select
      type={Select.Type.CUSTOM}
      multiple
      filter
      data={data}
      selected={selected}
      add={{alwaysVisible: true, label: 'Reset to default columns'}}
      onAdd={() => onChange(null)}
      onChange={(items: SelectItem[]) => onChange(items.map(item => String(item.key)))}
      customAnchor={({wrapperProps, buttonProps, popup}) => (
        <span {...wrapperProps} className="board-header__picker">
          <Button
            {...buttonProps}
            icon={eyeIcon}
            title={hidden > 0 ? `${hidden} more columns available. Show or hide columns` : 'Show or hide columns'}
            aria-label="Show or hide columns"
          >
            {/* Icon only: the anchor's props would otherwise label it with the shown columns. */}
            {null}
          </Button>
          {/* The column is narrow: the number of hidden columns is a small badge on the icon. */}
          {hidden > 0 && <span className="board-header__picker-badge">{hidden}</span>}
          {popup}
        </span>
      )}
    />
  );
};
