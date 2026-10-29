import React, {memo} from 'react';
import {useBoardContext} from './BoardContext';

type Props = {
  issueId: string;
  /** Thicker border: this is the parent issue of the box. */
  parent?: boolean;
};

/** Small rounded square standing in for a card; filled with the card color of the issue. */
const IssueDotComponent: React.FC<Props> = ({issueId, parent}) => {
  const ctx = useBoardContext();
  const issue = ctx.issuesById.get(issueId);
  const color = ctx.cardColorField && issue ? issue.fields[ctx.cardColorField]?.color : undefined;
  const style = color ? {backgroundColor: color.background} : undefined;
  const title = issue ? `${issue.idReadable}: ${issue.summary}` : issueId;
  return (
    <span
      className={`issue-dot${parent ? ' issue-dot_parent' : ''}${ctx.selectedIds.has(issueId) ? ' issue-dot_selected' : ''}${ctx.matchIds.has(issueId) ? ' issue-dot_highlighted' : ''}`}
      style={style}
      title={title}
      onClick={event => {
        event.stopPropagation();
        ctx.onSelect(issueId, event.ctrlKey || event.metaKey);
      }}
      onDoubleClick={() => ctx.onOpen(issueId)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          ctx.onSelect(issueId, event.ctrlKey || event.metaKey);
        }
      }}
      role="button"
      tabIndex={0}
    />
  );
};

export const IssueDot = memo(IssueDotComponent);
