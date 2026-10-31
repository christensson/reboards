import React, {memo, useLayoutEffect, useRef} from 'react';
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

/**
 * Publishes the sticky header's height as `--board-header-height` on the board content, so a card
 * scrolled into view stops below the header instead of under it (see its scroll-margin-top).
 */
const useHeaderHeight = (ref: React.RefObject<HTMLDivElement | null>): void => {
  useLayoutEffect(() => {
    const element = ref.current;
    const content = element?.parentElement;
    if (!element || !content) {
      return undefined;
    }
    const update = () => content.style.setProperty('--board-header-height', `${element.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      content.style.removeProperty('--board-header-height');
    };
  }, [ref]);
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
  const ref = useRef<HTMLDivElement>(null);
  useHeaderHeight(ref);
  /** Hover text of a column label: "<field>: <value>". */
  const hint = (label: string): string => (columnFieldName ? `${columnFieldName}: ${label}` : label);
  return (
    <div ref={ref} className="board-header" style={{gridTemplateColumns: headerTemplate(columns, collapsedColumns, twoLevel)}}>
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
        const valueLabels = column.values.map(value => field?.values.find(v => v.key === value)?.label ?? value);
        // A named or collapsed column lists its values: "State: In Progress, Review".
        const valuesHint = hint(valueLabels.length > 0 ? valueLabels.join(', ') : column.label);
        const action = `${isCollapsed ? 'Expand' : 'Collapse'} column ${column.label}`;
        return (
          <button
            key={column.id}
            type="button"
            className={`board-header__column${isCollapsed ? ' board-header__column_collapsed' : ''}`}
            title={column.named ? `${action} (${valueLabels.join(', ')})` : action}
            onClick={() => onToggleColumn(column.id)}
          >
            <div className="board-header__values">
              {isCollapsed && <span className="board-header__collapsed-label" title={valuesHint}>{column.label}</span>}
              {/* The "No <field>" column of a dynamic field has no value to show as a pill. */}
              {!isCollapsed && column.values.length === 0 && <span className="board-header__no-value" title={valuesHint}>{column.label}</span>}
              {!isCollapsed && column.named && <span className="board-header__name" title={valuesHint}>{column.label}</span>}
              {!isCollapsed && !column.named && column.values.map(value => {
                const meta = field?.values.find(v => v.key === value);
                return <ValuePill key={value} label={meta?.label ?? value} color={meta?.color} title={hint(meta?.label ?? value)}/>;
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
