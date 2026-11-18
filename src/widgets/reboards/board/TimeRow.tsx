import React, {memo} from 'react';
import type {LayoutColumn, LayoutRow} from '../model/layout';
import {useDateFormat} from '../data/useDateFormat';
import {periodLabel, rowStats} from '../model/timeBuckets';
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

/**
 * The row's period ("Week 47 · 16 Nov – 22 Nov", "S4 · 17 Nov – 28 Nov", "Q4 2026"), a day row
 * saying whether its issues start or end then ("Ends 12 Mar 2026 · 2.0"), and what the row holds
 * ("12 issues · 3w 3d of work · 2.3 persons").
 */
const useRowLabel = (row: LayoutRow, meaning: Props['meaning']): {label: string; stats: string} => {
  const formatDate = useDateFormat();
  const info = row.timeInfo;
  if (row.time === null || row.time === undefined || !info) {
    return {label: row.label, stats: ''};
  }
  let label = periodLabel(info, formatDate);
  if (info.bucket === 'day') {
    const when = `${meaning === 'start' ? 'Starts' : 'Ends'} ${label}`;
    label = info.names.length > 0 ? `${when} · ${info.names.join(', ')}` : when;
  }
  return {label, stats: rowStats(info)};
};

/**
 * A row of the time layout: the cards placed at one time, under a title strip with a line across
 * the whole board and the date on it. The strip has a track per column carrying the column line,
 * so the column lines run on unbroken.
 */
const TimeRowComponent: React.FC<Props> = ({row, meaning, columns, collapsedGroups, onToggleGroup}) => {
  const ctx = useBoardContext();
  const bandStyle: React.CSSProperties = {gridTemplateColumns: bandTemplate(columns, ctx.collapsedColumns)};
  const {label, stats} = useRowLabel(row, meaning);
  return (
    <div className={`board-row board-row_time${row.isUncategorized ? ' board-row_time-none' : ''}`} data-row-key={row.key}>
      <div className="time-row__title" style={bandStyle}>
        {columns.map(column => <span key={column.id} className="time-row__track"/>)}
        <span className="time-row__label" title={stats ? `${label} · ${stats}` : label}>
          {label}
          {stats && <span className="time-row__stats">{` · ${stats}`}</span>}
        </span>
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
