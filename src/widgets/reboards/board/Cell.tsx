import React, {memo} from 'react';
import {useDroppable} from '@dnd-kit/core';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import addIcon from '@jetbrains/icons/add-12px';
import {ASSIGN_COLUMN_ID} from '../model/layout';
import {type BoardContextValue, cellDroppableId, isHighlightedCell, useBoardContext} from './BoardContext';
import {IssueCard, IssueCardView} from './IssueCard';
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

/** The shadow of a card moved with Ctrl+arrows, with what the move would change. */
const KeyMoveShadow: React.FC = () => {
  const ctx = useBoardContext();
  const issue = ctx.keyMove ? ctx.issuesById.get(ctx.keyMove.issueId) : undefined;
  if (!ctx.keyMove || !issue) {
    return null;
  }
  // "Set SAN-5 State to Done." reads as "State to Done" on the card itself.
  const change = ctx.keyMove.hint.replace(/^Set \S+ /u, '').replace(/\.$/u, '');
  return (
    <div className="key-move" data-key-move>
      <IssueCardView issue={issue} size={ctx.cardSize} cardFields={ctx.cardFields} cardColorField={ctx.cardColorField} dragging/>
      <span className="key-move__label key-move__label_change" title={ctx.keyMove.hint}>{change}</span>
      <span className="key-move__label key-move__label_keys">Enter applies · Esc cancels</span>
    </div>
  );
};

/** The background cell the Ctrl+arrow shadow is in; cells inside boxes never hold it. */
const isKeyMoveCell = (keyMove: BoardContextValue['keyMove'], rowKey: string, columnId: string, groupKey: string | undefined): boolean =>
  !groupKey && keyMove?.rowKey === rowKey && keyMove.columnId === columnId;

/** Discreet "+" that expands to "New issue…" on hover and opens the new-issue page with presets. */
export const AddIssueLink: React.FC<{href: string; label?: string; title?: string}> = ({href, label = 'New issue…', title = label}) => (
  <a className="board-cell__add" href={href} target="_blank" rel="noreferrer" title={title}>
    <Icon glyph={addIcon} className="board-cell__add-icon"/>
    <span className="board-cell__add-label">{label}</span>
  </a>
);

const cellClasses = (isOver: boolean, groupKey: string | undefined, empty: boolean): string =>
  [
    'board-cell',
    isOver ? 'board-cell_over' : '',
    groupKey ? 'board-cell_group' : '',
    // Empty group cells hold at most the "New subtask…" link and need no minimum height.
    groupKey && empty ? 'board-cell_group-empty' : ''
  ]
    .filter(Boolean)
    .join(' ');

/** A cell of the "Assign <field>…" column: never holds cards; dropping here asks for the value to set. */
const AssignCell: React.FC<{nodeRef: (element: HTMLElement | null) => void; label: string; isOver: boolean}> = ({nodeRef, label, isOver}) => (
  <div ref={nodeRef} className={`board-cell board-cell_assign${isOver ? ' board-cell_over' : ''}`} title={`Drop an issue here to choose its value. ${label}`}>
    <span className="board-cell__assign-label">{label}</span>
  </div>
);

const CellComponent: React.FC<Props> = ({rowKey, columnId, issueIds, groupKey, parentId, showAdd = true, addSubtaskOf}) => {
  const ctx = useBoardContext();
  const {setNodeRef} = useDroppable({id: cellDroppableId(rowKey, columnId, groupKey), data: {rowKey, columnId}});
  const href = addSubtaskOf || showAdd ? ctx.newIssueHref(rowKey, columnId, addSubtaskOf) : null;
  // Only background cells light up; cells inside a box never do.
  const isOver = !groupKey && isHighlightedCell(ctx.dragHighlight, rowKey, columnId);
  if (columnId === ASSIGN_COLUMN_ID) {
    return <AssignCell nodeRef={setNodeRef} label={ctx.columnLabel(columnId)} isOver={isOver}/>;
  }
  if (ctx.collapsedColumns.has(columnId)) {
    return (
      <div ref={setNodeRef} className={`board-cell board-cell_collapsed${isOver ? ' board-cell_over' : ''}${groupKey ? ' board-cell_group' : ''}`}>
        {parentId && <IssueDot issueId={parentId} parent/>}
        {issueIds.map(id => <IssueDot key={id} issueId={ctx.issueIdOf(id)}/>)}
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={cellClasses(isOver, groupKey, issueIds.length === 0 && !parentId)}
    >
      {isKeyMoveCell(ctx.keyMove, rowKey, columnId, groupKey) && <KeyMoveShadow/>}
      {parentId && <IssueCard issueId={parentId} isParent/>}
      {issueIds.map(id => <IssueCard key={id} issueId={ctx.issueIdOf(id)} cardId={id}/>)}
      {href && (addSubtaskOf ? <AddIssueLink href={href} label="New subtask…" title={`New subtask of ${addSubtaskOf}…`}/> : <AddIssueLink href={href}/>)}
    </div>
  );
};

export const Cell = memo(CellComponent);
