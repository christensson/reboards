import React, {memo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import {ValuePill} from '@/common/components/ValuePill';
import {type LayoutColumn, type LayoutRow, packGroups} from '../model/layout';
import {BandDropCell} from './BandDropCell';
import {useBoardContext} from './BoardContext';
import {Cell} from './Cell';
import {GroupBox} from './GroupBox';
import {bandTemplate} from './tracks';

type Props = {
  row: LayoutRow;
  columns: LayoutColumn[];
  collapsed: boolean;
  collapsedGroups: Set<string>;
  onToggleRow: (rowKey: string) => void;
  onToggleGroup: (groupKey: string) => void;
  /** The picker row is the only row of its first-level swimlane, which has no issues. */
  pickerOnly?: boolean;
};

const BoardRowComponent: React.FC<Props> = ({row, columns, collapsed, collapsedGroups, onToggleRow, onToggleGroup, pickerOnly = false}) => {
  const ctx = useBoardContext();
  const bandStyle: React.CSSProperties = {gridTemplateColumns: bandTemplate(columns, ctx.collapsedColumns)};
  const bands = packGroups(row.groups);
  if (row.kind === 'picker') {
    return (
      <div className="board-row board-row_picker" data-row-key={row.key}>
        <div className={`board-band board-band_picker${pickerOnly ? ' board-band_picker-only' : ''}`} style={bandStyle}>
          {columns.map(column => (
            <BandDropCell key={column.id} rowKey={row.key} columnId={column.id} columnIndex={column.index} bandKey="picker" showAdd={pickerOnly}/>
          ))}
          <span className="board-row__picker-label" title="Drop an issue here to choose its swimlane">{row.label}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`board-row${collapsed ? ' board-row_collapsed' : ''}`} data-row-key={row.key}>
      <div className="board-row__header">
        <div className="board-row__title">
          <Button
            className="board-row__toggle"
            icon={collapsed ? chevronRightIcon : chevronDownIcon}
            title={collapsed ? 'Expand swimlane' : 'Collapse swimlane'}
            onClick={() => onToggleRow(row.key)}
          />
          {row.color ? (
            <ValuePill label={row.label} color={row.color} className="board-row__label"/>
          ) : (
            <span className={`board-row__label${row.isUncategorized ? ' board-row__label_uncategorized' : ''}`} title={row.label}>{row.label}</span>
          )}
        </div>
        <span className="board-row__count" title="Issues in this swimlane">{row.issueCount}</span>
      </div>
      {!collapsed && (
        <div className="board-row__body">
          <div className="board-band board-band_loose" style={bandStyle}>
            {columns.map(column => (
              <Cell key={column.id} rowKey={row.key} columnId={column.id} issueIds={row.looseByColumn[column.id] ?? []}/>
            ))}
          </div>
          {bands.map(bandGroups => (
            <div key={bandGroups[0].key} className="board-band board-band_group" style={bandStyle}>
              {columns.map(column => (
                <BandDropCell key={column.id} rowKey={row.key} columnId={column.id} columnIndex={column.index} bandKey={bandGroups[0].key}/>
              ))}
              {bandGroups.map(group => (
                <GroupBox key={group.key} group={group} columns={columns} collapsedGroups={collapsedGroups} onToggle={onToggleGroup}/>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const BoardRow = memo(BoardRowComponent);
