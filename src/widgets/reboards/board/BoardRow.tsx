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
  /** No swimlane header: the board has no swimlane field. */
  headless?: boolean;
};

/** Title band of a swimlane: collapse toggle, label and issue count. */
const RowHeader: React.FC<{row: LayoutRow; collapsed: boolean; onToggleRow: (rowKey: string) => void}> = ({row, collapsed, onToggleRow}) => (
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
);

type RowBodyProps = {
  row: LayoutRow;
  columns: LayoutColumn[];
  bandStyle: React.CSSProperties;
  collapsedGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
};

/** Boxes spanning several columns, packed into bands so that none overlap. */
const GroupBands: React.FC<RowBodyProps & {groups: LayoutRow['groups']}> = ({row, groups, columns, bandStyle, collapsedGroups, onToggleGroup}) => (
  <>
    {packGroups(groups).map(bandGroups => (
      <div key={bandGroups[0].key} className="board-band board-band_group" style={bandStyle}>
        {columns.map(column => (
          <BandDropCell key={column.id} rowKey={row.key} columnId={column.id} columnIndex={column.index} bandKey={bandGroups[0].key}/>
        ))}
        {bandGroups.map(group => (
          <GroupBox key={group.key} group={group} columns={columns} collapsedGroups={collapsedGroups} onToggle={onToggleGroup}/>
        ))}
      </div>
    ))}
  </>
);

/**
 * The cards of a row: loose cards first, then the subtask boxes. Boxes within one column wrap
 * side by side when the column is wide; boxes spanning several columns are packed into bands.
 */
export const RowBody: React.FC<RowBodyProps> = ({row, columns, bandStyle, collapsedGroups, onToggleGroup}) => {
  const single = row.groups.filter(group => group.startIndex === group.endIndex);
  const spanning = row.groups.filter(group => group.startIndex !== group.endIndex);
  return (
    <div className="board-row__body">
      <div className="board-band board-band_loose" style={bandStyle}>
        {columns.map(column => (
          <Cell key={column.id} rowKey={row.key} columnId={column.id} issueIds={row.looseByColumn[column.id] ?? []}/>
        ))}
      </div>
      {single.length > 0 && (
        <div className="board-band board-band_flow" style={bandStyle}>
          {columns.map(column => (
            <BandDropCell key={column.id} rowKey={row.key} columnId={column.id} columnIndex={column.index} bandKey="flow"/>
          ))}
          {columns.map(column => {
            const boxes = single.filter(group => group.startIndex === column.index);
            return boxes.length === 0 ? null : (
              <div key={column.id} className="board-band__flow" style={{gridColumn: `${column.index + 1}`, gridRow: 1}}>
                {boxes.map(group => (
                  <GroupBox key={group.key} group={group} columns={columns} collapsedGroups={collapsedGroups} onToggle={onToggleGroup} flow/>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <GroupBands row={row} groups={spanning} columns={columns} bandStyle={bandStyle} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}/>
    </div>
  );
};


const BoardRowComponent: React.FC<Props> = ({row, columns, collapsed, collapsedGroups, onToggleRow, onToggleGroup, pickerOnly = false, headless = false}) => {
  const ctx = useBoardContext();
  const bandStyle: React.CSSProperties = {gridTemplateColumns: bandTemplate(columns, ctx.collapsedColumns)};
  if (row.kind === 'picker') {
    return (
      <div className="board-row board-row_picker" data-row-key={row.key}>
        <div className={`board-band board-band_picker${pickerOnly ? ' board-band_picker-only' : ''}`} style={bandStyle}>
          {columns.map(column => (
            <BandDropCell key={column.id} rowKey={row.key} columnId={column.id} columnIndex={column.index} bandKey="picker" showAdd={pickerOnly && row.pickLevel !== 'outer'}/>
          ))}
          <span className="board-row__picker-label" title="Drop an issue here to choose the value">{row.label}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`board-row${collapsed ? ' board-row_collapsed' : ''}`} data-row-key={row.key}>
      {!headless && <RowHeader row={row} collapsed={collapsed} onToggleRow={onToggleRow}/>}
      {!collapsed && <RowBody row={row} columns={columns} bandStyle={bandStyle} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}/>}
    </div>
  );
};

export const BoardRow = memo(BoardRowComponent);
