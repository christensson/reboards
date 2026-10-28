import React, {memo} from 'react';
import {useDroppable} from '@dnd-kit/core';
import {cellDroppableId, isHighlightedCell, useBoardContext} from './BoardContext';
import {AddIssueLink} from './Cell';

type Props = {
  rowKey: string;
  columnId: string;
  columnIndex: number;
  bandKey: string;
  /** Show the "+" new-issue link at the top (swimlanes that have no issues). */
  showAdd?: boolean;
};

/**
 * Invisible drop target that fills one column track of a group band, underneath
 * the box. Drops that miss a cell (box title, space beside a box) still resolve
 * to this row and column.
 */
const BandDropCellComponent: React.FC<Props> = ({rowKey, columnId, columnIndex, bandKey, showAdd = false}) => {
  const ctx = useBoardContext();
  const {setNodeRef} = useDroppable({id: cellDroppableId(rowKey, columnId, `band:${bandKey}`), data: {rowKey, columnId}});
  const isOver = isHighlightedCell(ctx.dragHighlight, rowKey, columnId);
  const href = showAdd && !ctx.collapsedColumns.has(columnId) ? ctx.newIssueHref(rowKey, columnId) : null;
  return (
    <div
      ref={setNodeRef}
      className={`band-drop${isOver ? ' band-drop_over' : ''}`}
      style={{gridColumn: `${columnIndex + 1}`, gridRow: 1}}
    >
      {href && <AddIssueLink href={href}/>}
    </div>
  );
};

export const BandDropCell = memo(BandDropCellComponent);
