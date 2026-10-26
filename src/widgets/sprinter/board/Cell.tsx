import React, {memo} from 'react';
import {useDroppable} from '@dnd-kit/core';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import addIcon from '@jetbrains/icons/add-12px';
import {cellDroppableId, isHighlightedCell, useBoardContext} from './BoardContext';
import {IssueCard} from './IssueCard';
import {IssueDot} from './IssueDot';

type Props = {
  rowKey: string;
  columnId: string;
  issueIds: string[];
  groupKey?: string;
  /** Issue rendered first with the parent style (group boxes). */
  parentId?: string;
  showAdd?: boolean;
};

const CellComponent: React.FC<Props> = ({rowKey, columnId, issueIds, groupKey, parentId, showAdd = true}) => {
  const ctx = useBoardContext();
  const {setNodeRef} = useDroppable({id: cellDroppableId(rowKey, columnId, groupKey), data: {rowKey, columnId}});
  const href = showAdd ? ctx.newIssueHref(rowKey, columnId) : null;
  // Only background cells light up; cells inside a box never do.
  const isOver = !groupKey && isHighlightedCell(ctx.dragHighlight, rowKey, columnId);
  if (ctx.collapsedColumns.has(columnId)) {
    return (
      <div ref={setNodeRef} className={`board-cell board-cell_collapsed${isOver ? ' board-cell_over' : ''}${groupKey ? ' board-cell_group' : ''}`}>
        {parentId && <IssueDot issueId={parentId} parent/>}
        {issueIds.map(id => <IssueDot key={id} issueId={id}/>)}
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={`board-cell${isOver ? ' board-cell_over' : ''}${groupKey ? ' board-cell_group' : ''}`}>
      {parentId && <IssueCard issueId={parentId} isParent/>}
      {issueIds.map(id => <IssueCard key={id} issueId={id}/>)}
      {href && (
        <a className="board-cell__add" href={href} target="_blank" rel="noreferrer" title="New issue…">
          <Icon glyph={addIcon} className="board-cell__add-icon"/>
          <span className="board-cell__add-label">New issue…</span>
        </a>
      )}
    </div>
  );
};

export const Cell = memo(CellComponent);
