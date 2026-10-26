import React, {memo} from 'react';
import {ValuePill} from '@/common/components/ValuePill';
import type {FieldUniverse} from '../model/fieldUniverse';
import type {LayoutColumn} from '../model/layout';
import {headerTemplate} from './tracks';

type Props = {
  columns: LayoutColumn[];
  columnFieldName: string;
  universe: FieldUniverse;
  collapsedColumns: Set<string>;
  onToggleColumn: (columnId: string) => void;
  twoLevel: boolean;
};

const ColumnHeadersComponent: React.FC<Props> = ({columns, columnFieldName, universe, collapsedColumns, onToggleColumn, twoLevel}) => {
  const field = universe.byName.get(columnFieldName);
  return (
    <div className="board-header" style={{gridTemplateColumns: headerTemplate(columns, collapsedColumns, twoLevel)}}>
      {twoLevel && <div className="board-header__corner"/>}
      {columns.map(column => {
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
              {isCollapsed ? (
                <span className="board-header__collapsed-label" title={column.label}>{column.label}</span>
              ) : (
                column.values.map(value => {
                  const meta = field?.values.find(v => v.key === value);
                  return <ValuePill key={value} label={meta?.label ?? value} color={meta?.color}/>;
                })
              )}
            </div>
            <span className="board-header__count" title="Issues in this column">{column.count}</span>
          </button>
        );
      })}
    </div>
  );
};

export const ColumnHeaders = memo(ColumnHeadersComponent);
