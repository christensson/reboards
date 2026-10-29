import React, {memo} from 'react';
import type {LayoutColumn, LayoutRow} from '../model/layout';
import {useDateFormat, useDateTimeFormat} from '../data/useDateFormat';
import {RowBody} from './BoardRow';
import {useBoardContext} from './BoardContext';
import {bandTemplate} from './tracks';

type Props = {
  row: LayoutRow;
  /** Whether the times are starts or ends: "Starts 12 Mar 2026", "Ends 12 Mar 2026". */
  meaning: 'start' | 'end';
  columns: LayoutColumn[];
  collapsedGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
};

/** "Ends 12 Mar 2026 · 2.0": the row's date (and time), plus the versions or builds placed there. */
const useRowLabel = (row: LayoutRow, meaning: Props['meaning']): string => {
  const formatDate = useDateFormat();
  const formatDateTime = useDateTimeFormat();
  if (row.time === null || row.time === undefined) {
    return row.label;
  }
  const date = row.withTime ? formatDateTime(row.time) : formatDate(row.day ?? row.time);
  const when = `${meaning === 'start' ? 'Starts' : 'Ends'} ${date}`;
  return row.timeNames && row.timeNames.length > 0 ? `${when} · ${row.timeNames.join(', ')}` : when;
};

/**
 * A row of the time layout: the cards placed at one time, under a title strip with a line across
 * the whole board and the date on it. The strip has a track per column carrying the column line,
 * so the column lines run on unbroken.
 */
const TimeRowComponent: React.FC<Props> = ({row, meaning, columns, collapsedGroups, onToggleGroup}) => {
  const ctx = useBoardContext();
  const bandStyle: React.CSSProperties = {gridTemplateColumns: bandTemplate(columns, ctx.collapsedColumns)};
  const label = useRowLabel(row, meaning);
  return (
    <div className={`board-row board-row_time${row.isUncategorized ? ' board-row_time-none' : ''}`} data-row-key={row.key}>
      <div className="time-row__title" style={bandStyle}>
        {columns.map(column => <span key={column.id} className="time-row__track"/>)}
        <span className="time-row__label" title={label}>{label}</span>
      </div>
      <RowBody row={row} columns={columns} bandStyle={bandStyle} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}/>
    </div>
  );
};

export const TimeRow = memo(TimeRowComponent);

/** "Today": where the current date falls between the rows; its strip carries the column lines too. */
export const TodayLine: React.FC<{columns: LayoutColumn[]}> = ({columns}) => {
  const ctx = useBoardContext();
  return (
    <div className="time-today" style={{gridTemplateColumns: bandTemplate(columns, ctx.collapsedColumns)}} aria-label="Today">
      {columns.map(column => <span key={column.id} className="time-row__track"/>)}
      <span className="time-today__label">Today</span>
    </div>
  );
};
