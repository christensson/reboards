import React, {memo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import swapIcon from '@jetbrains/icons/changes';
import {ValuePill} from '@/common/components/ValuePill';
import type {FieldUniverse} from '../model/fieldUniverse';
import type {AvailableColumn, LayoutColumn} from '../model/layout';
import {ColumnPicker} from './ColumnPicker';
import {headerTemplate} from './tracks';

type Props = {
  columns: LayoutColumn[];
  columnFieldName: string;
  universe: FieldUniverse;
  collapsedColumns: Set<string>;
  onToggleColumn: (columnId: string) => void;
  twoLevel: boolean;
  swappedSwimlanes: boolean;
  onToggleSwappedSwimlanes: () => void;
  /** Dynamic column fields: every column that could be shown, for the picker in the "Assign <field>…" header. */
  availableColumns: AvailableColumn[];
  onPickColumns: (columnIds: string[] | null) => void;
};

const ColumnHeadersComponent: React.FC<Props> = ({
  columns,
  columnFieldName,
  universe,
  collapsedColumns,
  onToggleColumn,
  twoLevel,
  swappedSwimlanes,
  onToggleSwappedSwimlanes,
  availableColumns,
  onPickColumns
}) => {
  const field = universe.byName.get(columnFieldName);
  return (
    <div className="board-header" style={{gridTemplateColumns: headerTemplate(columns, collapsedColumns, twoLevel)}}>
      {twoLevel && (
        <div className="board-header__corner">
          <Button
            icon={swapIcon}
            active={swappedSwimlanes}
            title={swappedSwimlanes ? 'Swimlane levels are swapped. Click to restore' : 'Swap the two swimlane levels'}
            onClick={onToggleSwappedSwimlanes}
          />
        </div>
      )}
      {columns.map(column => {
        if (column.assign) {
          // The column picker lives in the rightmost "Assign <field>…" column, which is never collapsed.
          return (
            <div key={column.id} className="board-header__column board-header__column_assign">
              <ColumnPicker columns={availableColumns} onChange={onPickColumns}/>
            </div>
          );
        }
        const isCollapsed = collapsedColumns.has(column.id);
        return (
          <button
            key={column.id}
            type="button"
            className={`board-header__column${isCollapsed ? ' board-header__column_collapsed' : ''}`}
            title={isCollapsed ? `Expand column ${column.label}` : `Collapse column ${column.label}`}
            onClick={() => onToggleColumn(column.id)}
          >
            <div className="board-header__values">
              {isCollapsed && <span className="board-header__collapsed-label" title={column.label}>{column.label}</span>}
              {/* The "No <field>" column of a dynamic field has no value to show as a pill. */}
              {!isCollapsed && column.values.length === 0 && <span className="board-header__no-value">{column.label}</span>}
              {!isCollapsed && column.values.map(value => {
                const meta = field?.values.find(v => v.key === value);
                return <ValuePill key={value} label={meta?.label ?? value} color={meta?.color}/>;
              })}
            </div>
            <span className="board-header__count" title="Issues in this column">{column.count}</span>
          </button>
        );
      })}
    </div>
  );
};

export const ColumnHeaders = memo(ColumnHeadersComponent);
