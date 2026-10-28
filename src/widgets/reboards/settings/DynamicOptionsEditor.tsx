import React from 'react';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {BOARD_LIMITS, type DynamicOptions, type DynamicSortMode, type FieldKind} from '@/common/model/board-config';

type Props = {
  /** Kind of the field: user fields sort by name only, versions and builds also by date. */
  kind: FieldKind | 'other';
  options: DynamicOptions;
  onChange: (options: DynamicOptions) => void;
  /** Columns: also ask how many columns are shown by default. */
  columns?: boolean;
  disabled?: boolean;
};

const NAME_SORTS: SelectItem[] = [
  {key: 'alphabetical', label: 'Alphabetical, ascending (A to Z)'},
  {key: 'alphabetical-desc', label: 'Alphabetical, descending (Z to A)'}
];

const DATE_SORTS: SelectItem[] = [
  {key: 'date', label: 'Date, oldest first'},
  {key: 'date-desc', label: 'Date, newest first'}
];

/** Sorting and filtering of a dynamic field (user, version, build), whose columns or swimlanes come from the issues. */
export const DynamicOptionsEditor: React.FC<Props> = ({kind, options, onChange, columns, disabled}) => {
  const sortItems = kind === 'version' || kind === 'build' ? [...NAME_SORTS, ...DATE_SORTS] : NAME_SORTS;
  const patch = (changes: Partial<DynamicOptions>) => onChange({...options, ...changes});
  const what = columns ? 'Columns' : 'Swimlanes';
  return (
    <>
      <span className="settings-field__help">
        {`${what} are the values the board's issues carry; issues without a value come first.`}
      </span>
      <div className="settings-field">
        <span className="settings-field__label">{`Sort ${what.toLowerCase()}`}</span>
        <Select
          type={Select.Type.BUTTON}
          disabled={disabled}
          data={sortItems}
          selected={sortItems.find(item => item.key === options.sort) ?? sortItems[0]}
          onChange={(item: SelectItem | null) => item && patch({sort: item.key as DynamicSortMode})}
        />
        {kind === 'version' && <span className="settings-field__help">Versions sort by release date, else start date; builds by assembly date. Undated values come last.</span>}
      </div>
      {kind === 'version' && (
        <div className="settings-field">
          <Toggle checked={options.showReleased} disabled={disabled} onChange={event => patch({showReleased: event.target.checked})}>
            Show released versions
          </Toggle>
          <Toggle checked={options.showArchived} disabled={disabled} onChange={event => patch({showArchived: event.target.checked})}>
            Show archived versions
          </Toggle>
          <span className="settings-field__help">Issues with only hidden versions count as having no version.</span>
        </div>
      )}
      {columns && (
        <div className="settings-field">
          <span className="settings-field__label">Columns shown by default</span>
          <Input
            size={Size.S}
            type="number"
            min={1}
            max={BOARD_LIMITS.dynamicColumns}
            value={String(options.maxColumns)}
            disabled={disabled}
            onChange={event => patch({maxColumns: Math.max(1, Math.min(BOARD_LIMITS.dynamicColumns, Number(event.target.value) || 1))})}
          />
          <span className="settings-field__help">Everyone can show other columns from the last column header; the choice is kept per user.</span>
        </div>
      )}
    </>
  );
};
