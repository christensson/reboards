import React, {memo} from 'react';
import {useDroppable} from '@dnd-kit/core';
import {cellDroppableId, isHighlightedCell, useBoardContext} from './BoardContext';

type Props = {
  rowKey: string;
  columnId: string;
  columnIndex: number;
  bandKey: string;
};

/**
 * Invisible drop target that fills one column track of a group band, underneath
 * the box. Drops that miss a cell (box title, space beside a box) still resolve
 * to this row and column.
 */
const BandDropCellComponent: React.FC<Props> = ({rowKey, columnId, columnIndex, bandKey}) => {
  const ctx = useBoardContext();
  const {setNodeRef} = useDroppable({id: cellDroppableId(rowKey, columnId, `band:${bandKey}`), data: {rowKey, columnId}});
  const isOver = isHighlightedCell(ctx.dragHighlight, rowKey, columnId);
  return (
    <div
      ref={setNodeRef}
      className={`band-drop${isOver ? ' band-drop_over' : ''}`}
      style={{gridColumn: `${columnIndex + 1}`, gridRow: 1}}
    />
  );
};

export const BandDropCell = memo(BandDropCellComponent);
