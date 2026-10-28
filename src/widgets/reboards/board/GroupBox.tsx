import React, {memo} from 'react';
import {useDraggable, useDroppable} from '@dnd-kit/core';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import type {LayoutColumn, LayoutGroup} from '../model/layout';
import {type BoardContextValue, useBoardContext} from './BoardContext';
import {Cell} from './Cell';
import {IssueDot} from './IssueDot';
import {type TrackInsets, boxTracks} from './tracks';
import {LINK_GROUP_PREFIX} from '../model/linkTargets';

type Props = {
  group: LayoutGroup;
  columns: LayoutColumn[];
  collapsedGroups: Set<string>;
  onToggle: (groupKey: string) => void;
  /** Column index of the first track of the containing grid (0 for the row band). */
  containerStart?: number;
  /** Insets already taken from the containing grid's tracks (none for the row band). */
  containerInsets?: TrackInsets;
};

const MAX_DEPTH_CLASS = 3;

const groupCount = (group: LayoutGroup): string => (group.m === null ? `${group.n}` : `${group.n} of ${group.m}`);

export const GROUP_DRAG_PREFIX = 'group:';

const groupCountHint = (group: LayoutGroup): string => {
  const first = group.m === null
    ? `Contains ${group.n} subtasks of ${group.parentIdReadable}.`
    : `Contains ${group.n} of ${group.m} subtasks of ${group.parentIdReadable}.`;
  const elsewhere: string[] = [];
  if (group.childrenInOtherRows > 0) {
    elsewhere.push(`${group.childrenInOtherRows} are in other swimlanes`);
  }
  if (group.childrenOffBoard !== null && group.childrenOffBoard > 0) {
    elsewhere.push(`${group.childrenOffBoard} are not on this board (other sprint or outside the query)`);
  }
  return elsewhere.length > 0 ? `${first}\n${elsewhere.join(', ')}.` : first;
};

const groupTitleHint = (group: LayoutGroup): string => {
  const issue = `${group.parentIdReadable}: ${group.parentSummary}`;
  if (group.parentOnBoard && !group.parentInThisRow && group.parentRowLabel) {
    return `"${issue}" is in ${group.parentRowLabel} swimlane.`;
  }
  return issue;
};

const GroupTitle: React.FC<{group: LayoutGroup; collapsed: boolean; spanLength: number; onToggle: (key: string) => void}> = ({
  group,
  collapsed,
  spanLength,
  onToggle
}) => {
  const ctx = useBoardContext();
  const locked = !ctx.canMoveGroup(group);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `${GROUP_DRAG_PREFIX}${group.key}`,
    data: {groupKey: group.key},
    disabled: locked
  });
  return (
    <div
      ref={setNodeRef}
      className={`group-box__title${isDragging ? ' group-box__title_dragging' : ''}${locked ? ' group-box__title_locked' : ''}`}
      style={{gridColumn: `1 / ${spanLength + 1}`}}
      title={`${groupTitleHint(group)}\n${locked ? 'You do not have permission to move these subtasks' : 'Drag to move the subtasks to another swimlane'}. Double-click to open ${group.parentIdReadable}.`}
      onDoubleClick={event => {
        event.stopPropagation();
        ctx.onOpen(group.parentId);
      }}
      {...attributes}
      {...listeners}
    >
      <Button
        className="group-box__toggle"
        icon={collapsed ? chevronRightIcon : chevronDownIcon}
        title={collapsed ? 'Expand group' : 'Collapse group'}
        onClick={() => onToggle(group.key)}
      />
      <span className="group-box__parent">
        <span className="group-box__parent-id">{group.parentIdReadable}</span>
        {group.parentSummary ? `: ${group.parentSummary}` : ''}
      </span>
      {group.groupTotal > 1 && (
      <span className="group-box__index" title={`Box ${group.groupIndex} of ${group.groupTotal} for ${group.parentIdReadable}`}>
        {`(${group.groupIndex}/${group.groupTotal})`}
      </span>
    )}
      <span className="group-box__count" title={groupCountHint(group)}>{groupCount(group)}</span>
    </div>
  );
};

const GroupIndicators: React.FC<{group: LayoutGroup; span: LayoutColumn[]}> = ({group, span}) => (
  <>
    {span.map(column => (
      <div key={column.id} className="group-box__indicator-cell">
        {(group.allIdsByColumn[column.id] ?? []).map(id => <IssueDot key={id} issueId={id} parent={id === group.parentId}/>)}
      </div>
    ))}
  </>
);

const GroupMemberRow: React.FC<{group: LayoutGroup; span: LayoutColumn[]}> = ({group, span}) => (
  <>
    {span.map(column => {
      const isParentColumn = group.parentInThisRow && group.parentColumnId === column.id;
      return (
        <div key={column.id} className={`group-box__column${isParentColumn ? ' group-box__column_parent' : ''}`}>
          <Cell
            rowKey={group.rowKey}
            columnId={column.id}
            issueIds={group.membersByColumn[column.id] ?? []}
            groupKey={group.key}
            parentId={isParentColumn ? group.parentId : undefined}
            showAdd={false}
            addSubtaskOf={group.parentIdReadable}
          />
        </div>
      );
    })}
  </>
);

/** Boxes holding only nested boxes still get a member row when it carries the "New subtask…" links. */
const needsMemberRow = (group: LayoutGroup, span: LayoutColumn[], newIssueHref: BoardContextValue['newIssueHref']): boolean =>
  group.memberIds.length > 0 ||
  group.parentInThisRow ||
  (span.length > 0 && newIssueHref(group.rowKey, span[0].id, group.parentIdReadable) !== null);

function GroupBoxComponent({group, columns, collapsedGroups, onToggle, containerStart = 0, containerInsets}: Props): React.JSX.Element {
  const ctx = useBoardContext();
  // Target for Ctrl/Ctrl+Shift drags: the box stands for its parent issue.
  const {setNodeRef: setLinkDropRef} = useDroppable({
    id: `${LINK_GROUP_PREFIX}${group.key}`,
    data: {kind: 'link-group', groupKey: group.key, parentId: group.parentId, parentIdReadable: group.parentIdReadable}
  });
  const collapsed = collapsedGroups.has(group.key);
  const span = columns.slice(group.startIndex, group.endIndex + 1);
  const tracks = boxTracks(span, ctx.collapsedColumns, containerInsets);
  const style: React.CSSProperties = {
    gridColumn: `${group.startIndex - containerStart + 1} / ${group.endIndex - containerStart + 2}`,
    gridTemplateColumns: tracks.template,
    // Top-level boxes share grid row 1 with the band's drop targets so the targets stretch behind the box.
    ...(group.depth === 0 ? {gridRow: 1} : {})
  };
  const classes = [
    'group-box',
    `group-box_depth-${Math.min(group.depth, MAX_DEPTH_CLASS)}`,
    collapsed ? 'group-box_collapsed' : '',
    group.parentInThisRow ? 'group-box_parent-here' : '',
    ctx.linkHighlight?.kind === 'group' && ctx.linkHighlight.id === group.key ? 'group-box_link-target' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const hasMemberRow = needsMemberRow(group, span, ctx.newIssueHref);
  // A box that lies entirely in collapsed columns shows only its dots: no title, toggle or counts.
  const withinCollapsed = span.every(column => ctx.collapsedColumns.has(column.id));

  if (withinCollapsed) {
    return (
      <div ref={setLinkDropRef} className={`${classes} group-box_minimal`} style={style} data-group-key={group.key}>
        <GroupIndicators group={group} span={span}/>
      </div>
    );
  }

  return (
    <div ref={setLinkDropRef} className={classes} style={style} data-group-key={group.key}>
      <GroupTitle group={group} collapsed={collapsed} spanLength={span.length} onToggle={onToggle}/>
      {collapsed && <GroupIndicators group={group} span={span}/>}
      {!collapsed && hasMemberRow && <GroupMemberRow group={group} span={span}/>}
      {!collapsed &&
        group.children.map(child => (
          <GroupBoxComponent
            key={child.key}
            group={child}
            columns={columns}
            collapsedGroups={collapsedGroups}
            onToggle={onToggle}
            containerStart={group.startIndex}
            containerInsets={tracks.insets}
          />
        ))}
    </div>
  );
}

export const GroupBox = memo(GroupBoxComponent);
