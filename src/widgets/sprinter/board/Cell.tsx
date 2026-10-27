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
  /** Group cells: offer "New subtask…" of this parent instead of "New issue…". */
  addSubtaskOf?: string;
};

/** Discreet "+" that expands to "New issue…" on hover and opens the new-issue page with presets. */
export const AddIssueLink: React.FC<{href: string; label?: string; title?: string}> = ({href, label = 'New issue…', title = label}) => (
  <a className="board-cell__add" href={href} target="_blank" rel="noreferrer" title={title}>
    <Icon glyph={addIcon} className="board-cell__add-icon"/>
    <span className="board-cell__add-label">{label}</span>
  </a>
);

const CellComponent: React.FC<Props> = ({rowKey, columnId, issueIds, groupKey, parentId, showAdd = true, addSubtaskOf}) => {
  const ctx = useBoardContext();
  const {setNodeRef} = useDroppable({id: cellDroppableId(rowKey, columnId, groupKey), data: {rowKey, columnId}});
  const href = addSubtaskOf || showAdd ? ctx.newIssueHref(rowKey, columnId, addSubtaskOf) : null;
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
      {href && (addSubtaskOf ? <AddIssueLink href={href} label="New subtask…" title={`New subtask of ${addSubtaskOf}…`}/> : <AddIssueLink href={href}/>)}
    </div>
  );
};

export const Cell = memo(CellComponent);
