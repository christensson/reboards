import React, {memo, useCallback} from 'react';
import {useDraggable} from '@dnd-kit/core';
import Avatar from '@jetbrains/ring-ui-built/components/avatar/avatar';
import {Size as AvatarSize} from '@jetbrains/ring-ui-built/components/avatar/avatar-size';
import {ValuePill} from '@/common/components/ValuePill';
import type {FieldValue} from '@/common/youtrack/fields';
import type {CardSize} from '@/common/storage/prefs';
import type {BoardIssue} from '../model/issue';
import {searchWords, splitForHighlight} from '../model/search';
import {useBoardContext} from './BoardContext';

type ViewProps = {
  issue: BoardIssue;
  size: CardSize;
  cardFields: string[];
  /** Name of the field whose value color tints the card. */
  cardColorField?: string | null;
  style?: React.CSSProperties;
  selected?: boolean;
  highlighted?: boolean;
  searchTerm?: string;
  dragging?: boolean;
  isParent?: boolean;
};

const Highlighted: React.FC<{text: string; words: string[]}> = ({text, words}) => {
  const nodes: React.ReactNode[] = [];
  let offset = 0;
  splitForHighlight(text, words).forEach(segment => {
    const key = `${offset}`;
    nodes.push(segment.match ? <mark key={key} className="issue-card__match">{segment.text}</mark> : <React.Fragment key={key}>{segment.text}</React.Fragment>);
    offset += segment.text.length;
  });
  return nodes;
};

const FieldChip: React.FC<{name: string; value: FieldValue | null}> = ({name, value}) => {
  if (!value) {
    return null;
  }
  if (value.avatarUrl !== undefined || value.$type.includes('User')) {
    return (
      <span className="issue-card__field issue-card__field_user" title={`${name}: ${value.labels.join(', ')}`}>
        <Avatar size={AvatarSize.Size16} url={value.avatarUrl ?? null} username={value.label}/>
        <span className="issue-card__field-text">{value.labels.join(', ')}</span>
      </span>
    );
  }
  if (value.color) {
    return <ValuePill label={value.labels.join(', ')} color={value.color} title={`${name}: ${value.labels.join(', ')}`}/>;
  }
  return (
    <span className="issue-card__field" title={`${name}: ${value.labels.join(', ')}`}>
      <span className="issue-card__field-name">{name}</span>
      <span className="issue-card__field-text">{value.labels.join(', ')}</span>
    </span>
  );
};

/** Pure card rendering, also used for the drag overlay. */
export const IssueCardView = React.forwardRef<HTMLDivElement, ViewProps & React.HTMLAttributes<HTMLDivElement>>(
  ({issue, size, cardFields, cardColorField, selected, highlighted, searchTerm = '', dragging, isParent, className, style, ...rest}, ref) => {
    const color = cardColorField ? issue.fields[cardColorField]?.color : undefined;
    const colorStyle: React.CSSProperties | undefined = color
      ? ({'--card-color': color.background} as React.CSSProperties)
      : undefined;
    const classes = [
      'issue-card',
      `issue-card_${size}`,
      selected ? 'issue-card_selected' : '',
      highlighted ? 'issue-card_highlighted' : '',
      dragging ? 'issue-card_dragging' : '',
      isParent ? 'issue-card_parent' : '',
      className ?? ''
    ].filter(Boolean).join(' ');
    const words = searchWords(searchTerm);
    return (
      <div ref={ref} className={`${classes}${color ? ' issue-card_colored' : ''}`} style={{...colorStyle, ...style}} data-issue-id={issue.id} {...rest}>
        {isParent && <span className="issue-card__parent-badge">parent</span>}
        <div className="issue-card__title">
          <span className="issue-card__id"><Highlighted text={issue.idReadable} words={words}/>{': '}</span>
          <span className="issue-card__summary"><Highlighted text={issue.summary} words={words}/></span>
          {size === 'normal' && issue.tags.map(tag => (
            <span
              key={tag.id}
              className={`issue-card__tag${tag.color ? '' : ' issue-card__tag_plain'}`}
              style={tag.color ? {backgroundColor: tag.color.background, color: tag.color.foreground} : undefined}
              title={`Tag: ${tag.name}`}
            >
              {tag.name}
            </span>
          ))}
        </div>
        {size === 'normal' && cardFields.length > 0 && (
          <div className="issue-card__fields">
            {cardFields.map(name => <FieldChip key={name} name={name} value={issue.fields[name] ?? null}/>)}
          </div>
        )}
      </div>
    );
  }
);
IssueCardView.displayName = 'IssueCardView';

type Props = {
  issueId: string;
  isParent?: boolean;
};

const IssueCardComponent: React.FC<Props> = ({issueId, isParent}) => {
  const ctx = useBoardContext();
  const issue = ctx.issuesById.get(issueId);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({id: issueId, data: {issueId}});

  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      setNodeRef(element);
      ctx.registry.register(issueId, element);
    },
    [setNodeRef, ctx.registry, issueId]
  );

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      ctx.onSelect(issueId, event.ctrlKey || event.metaKey);
    },
    [ctx, issueId]
  );
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      ctx.onOpen(issueId);
    },
    [ctx, issueId]
  );

  if (!issue) {
    return null;
  }
  return (
    <IssueCardView
      ref={setRef}
      issue={issue}
      size={ctx.cardSize}
      cardFields={ctx.cardFields}
      cardColorField={ctx.cardColorField}
      selected={ctx.selectedIds.has(issueId)}
      highlighted={ctx.matchIds.has(issueId)}
      searchTerm={ctx.searchTerm}
      dragging={isDragging}
      isParent={isParent}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...attributes}
      {...listeners}
    />
  );
};

export const IssueCard = memo(IssueCardComponent);
