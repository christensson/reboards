import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import infoIcon from '@jetbrains/icons/info';
import timeIcon from '@jetbrains/icons/time-12px';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import unfoldLessIcon from '@jetbrains/icons/unfold-less';
import unfoldMoreIcon from '@jetbrains/icons/unfold-more';
import {collapseLevel, expandLevel, isExpandable} from '../../model/ganttNav';
import type {BoardConfig} from '@/common/model/board-config';
import type {CardSize, ConnectorsMode} from '@/common/storage/prefs';
import {issueUrl} from '@/common/youtrack/urls';
import type {FieldUniverse} from '../../model/fieldUniverse';
import {type GanttIssueRow, type GanttRow, buildGanttRows, ganttEdges, ganttRange, undatedToggleKey} from '../../model/gantt';
import {type GanttScale, dayX, ganttScale, padDays} from '../../model/ganttScale';
import type {BoardIssue} from '../../model/issue';
import type {FieldEdit} from '../../model/ganttEdit';
import {todayPosition} from '../../model/timeline';
import {MS_PER_DAY, formatWorkHours} from '../../model/workTime';
import type {CardRegistry} from '../BoardContext';
import type {NavMode} from '../useBoardKeys';
import {GanttArrows} from './GanttArrows';
import {GanttBars, type RowEdit} from './GanttBars';
import {GanttDetails, GanttLegend} from './GanttDetails';
import {GanttGrid, GanttScaleHeader} from './GanttGrid';
import {ROW_HEIGHT, anchorBox, rowLayout} from './geometry';
import {GanttConfirm} from './GanttConfirm';
import {useGanttEdit} from './useGanttEdit';
import {useGanttKeys} from './useGanttKeys';
import {useGanttZoom} from './useGanttZoom';

type Props = {
  board: BoardConfig;
  issues: BoardIssue[];
  universe: FieldUniverse;
  baseUrl: string;
  /** Width of a day in pixels. */
  pxPerDay: number;
  onPxPerDay: (pxPerDay: number) => void;
  size: CardSize;
  connectorsMode: ConnectorsMode;
  collapsed: Set<string>;
  showUndated: Set<string>;
  onToggleCollapsed: (issueId: string) => void;
  /** Collapses or expands several parents at once: one level of every tree. */
  onSetCollapsed: (issueIds: string[], collapse: boolean) => void;
  onToggleUndated: (key: string) => void;
  selectedIds: Set<string>;
  /** Quick filter and find matches. */
  matchIds: Set<string>;
  onSelect: (issueId: string, additive: boolean) => void;
  setSelectedIds: (ids: Set<string>) => void;
  /** False while the find box or a dialog of the board is open: the keys are theirs. */
  keysEnabled: boolean;
  onToggleConnectors: () => void;
  onHelp: () => void;
  /** Highlight navigation mode, when on. */
  navMode: NavMode | null;
  /** Whether the user may change the issue's fields: its bars get drag handles. */
  canEdit: (issue: BoardIssue) => boolean;
  /** Saves fields changed by dragging, once confirmed. */
  onSaveEdits: (issue: BoardIssue, edits: FieldEdit[]) => Promise<void>;
  onClearSelection: () => void;
  onOpen: (issueId: string) => void;
  /** Rows register here so find can order and scroll to them. */
  registry: CardRegistry;
  /** Raised to scroll today into view. */
  todaySignal: number;
  /** Raised to zoom so that every issue shows. */
  fitSignal: number;
};

const INDENT = 16;
const LIST_WIDTH = {initial: 340, min: 200, max: 640};

/** The bar color: the card color field's value color, else the theme's main color. */
const barStyle = (row: GanttRow, colorField: string | null): React.CSSProperties => {
  const color = row.type === 'issue' && colorField ? row.issue.fields[colorField]?.color?.background : undefined;
  return color ? ({'--bar-color': color} as React.CSSProperties) : {};
};

const rowClass = (base: string, row: GanttRow, selectedIds: Set<string>, matchIds: Set<string>, cursor: string | null): string => {
  if (row.type !== 'issue') {
    return `${base} ${base}_undated${row.key === cursor ? ` ${base}_selected` : ''}`;
  }
  const id = row.issue.id;
  return [
    base,
    selectedIds.has(id) ? `${base}_selected` : '',
    matchIds.has(id) ? `${base}_match` : '',
    row.issue.resolved ? `${base}_resolved` : '',
    row.timed ? '' : `${base}_untimed`
  ].filter(Boolean).join(' ');
};

/** A top-level row after the first starts a new group: a stronger line above it. */
const startsGroup = (row: GanttRow, index: number): boolean => index > 0 && row.depth === 0;

const undatedText = (row: Extract<GanttRow, {type: 'undated'}>): string => {
  if (row.parentId === null) {
    return `${row.count} ${row.count === 1 ? 'issue' : 'issues'} without time`;
  }
  const what = `${row.count} ${row.count === 1 ? 'subtask' : 'subtasks'} without time`;
  return row.expanded ? `Hide ${what}` : `Show ${what}`;
};

type LabelProps = {
  row: GanttRow;
  className: string;
  height: number;
  baseUrl: string;
  focused: boolean;
  onToggleCollapsed: (issueId: string) => void;
  onToggleUndated: (key: string) => void;
  registry: CardRegistry;
};

const Toggle: React.FC<{expanded: boolean; label: string; onClick: () => void}> = ({expanded, label, onClick}) => (
  <Button
    className="gantt-label__toggle"
    icon={expanded ? chevronDownIcon : chevronRightIcon}
    title={label}
    aria-label={label}
    onClick={(event: React.MouseEvent) => {
      event.stopPropagation();
      onClick();
    }}
  />
);

const GanttLabelComponent: React.FC<LabelProps> = ({row, className, height, baseUrl, focused, onToggleCollapsed, onToggleUndated, registry}) => {
  const style = {height, paddingLeft: row.depth * INDENT};
  const focusClass = focused ? ' gantt-label_focused' : '';
  if (row.type === 'undated') {
    return (
      <div className={`${className}${focusClass}`} style={style} role="row" aria-level={row.depth + 1} aria-expanded={row.expanded} data-row-key={row.key}>
        <Toggle expanded={row.expanded} label={undatedText(row)} onClick={() => onToggleUndated(undatedToggleKey(row))}/>
        <button
          type="button"
          className="gantt-label__undated"
          onClick={event => {
            // The row would toggle it once more.
            event.stopPropagation();
            onToggleUndated(undatedToggleKey(row));
          }}
        >
          {undatedText(row)}
        </button>
      </div>
    );
  }
  const {issue} = row;
  const hasChildren = isExpandable(row);
  const untimed = row.undatedChildIds.length;
  const untimedText = `${untimed} ${untimed === 1 ? 'subtask' : 'subtasks'} without time: ${row.showingUndated ? 'hide' : 'show'}`;
  const estimate = row.schedule.estimate;
  return (
    <div
      ref={element => registry.register(issue.id, element)}
      className={`${className}${focusClass}`}
      style={style}
      role="row"
      aria-level={row.depth + 1}
      aria-selected={className.includes('_selected')}
      {...(hasChildren ? {'aria-expanded': !row.collapsed} : {})}
      data-row-key={row.key}
      data-issue-id={issue.id}
    >
      {hasChildren
        ? <Toggle expanded={!row.collapsed} label={row.collapsed ? 'Expand subtasks' : 'Collapse subtasks'} onClick={() => onToggleCollapsed(issue.id)}/>
        : <span className="gantt-label__spacer"/>}
      <a className="gantt-label__id" href={issueUrl(baseUrl, issue.idReadable)} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>
        {issue.idReadable}
      </a>
      <span className="gantt-label__summary" title={issue.summary}>{issue.summary}</span>
      {untimed > 0 && (
        <button
          type="button"
          className={`gantt-label__untimed${row.showingUndated ? ' gantt-label__untimed_shown' : ''}`}
          title={untimedText}
          aria-label={untimedText}
          aria-pressed={row.showingUndated}
          onClick={event => {
            event.stopPropagation();
            onToggleUndated(issue.id);
            // Shown in a collapsed parent, they would stay hidden.
            if (!row.showingUndated && row.collapsed) {
              onToggleCollapsed(issue.id);
            }
          }}
        >
          <Icon glyph={timeIcon} className="gantt-label__untimed-icon" aria-hidden="true"/>
          {untimed}
        </button>
      )}
      {estimate !== undefined && <span className="gantt-label__estimate" title="Estimate">{formatWorkHours(estimate)}</span>}
    </div>
  );
};

const GanttLabel = memo(GanttLabelComponent);

/** The row under the pointer: where in the viewport (for the details) and on the chart (for the day marker). */
type Hover = {key: string; x: number; y: number; chartX: number};

/** The day under an x on the chart. */
const dayAt = (scale: GanttScale, x: number): number => scale.start + Math.floor(x / scale.pxPerDay) * MS_PER_DAY;

type ChartRowProps = {
  row: GanttRow;
  className: string;
  style: React.CSSProperties;
  scale: GanttScale;
  size: CardSize;
  edit: RowEdit | undefined;
  /** The pointer's x on the chart while it is over this row. */
  hoverX: number | null;
  onClick: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onHover: (event: React.MouseEvent, chartX: number) => void;
  /** A press on the empty row of an issue without time: drawing a plan starts on that day. */
  onDraw: (event: React.PointerEvent, day: number) => void;
};

/** A row of the chart: the issue's bars, or for an issue without time an empty row to draw a plan on. */
const ChartRow: React.FC<ChartRowProps> = ({row, className, style, scale, size, edit, hoverX, onClick, onOpen, onHover, onDraw}) => {
  const plannable = Boolean(edit?.plannable);
  const xOf = (event: React.MouseEvent) => event.clientX - event.currentTarget.getBoundingClientRect().left;
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the treegrid takes the keys
    <div
      className={`${className}${plannable ? ' gantt-row_plannable' : ''}`}
      style={style}
      title={plannable ? 'Drag across the row to plan; click to plan from the estimate' : undefined}
      onClick={onClick}
      onDoubleClick={onOpen}
      onMouseMove={event => onHover(event, xOf(event))}
      onPointerDown={plannable ? event => onDraw(event, dayAt(scale, xOf(event))) : undefined}
    >
      {plannable && hoverX !== null && !edit?.pending && (
        <span className="gantt-plan-marker" style={{left: dayX(scale, dayAt(scale, hoverX)), width: Math.max(2, scale.pxPerDay)}}/>
      )}
      {row.type === 'issue' && (row.timed || edit?.pending) && <GanttBars row={row} scale={scale} size={size} edit={edit}/>}
    </div>
  );
};

/** Where the drag label sits from the pointer. */
const DRAG_LABEL_OFFSET = 14;

/** Room left around a row scrolled into view. */
const SCROLL_MARGIN = 8;
/** Room left of a bar scrolled into view. */
const BAR_MARGIN = 32;

/**
 * Scrolls a row into the visible part of the chart: below the sticky time scale and above the
 * bottom edge (and its scrollbar). A bar entirely out of view sideways is brought in as well.
 */
const revealRow = (container: HTMLElement, label: HTMLElement, bar: {left: number; width: number} | undefined, listWidth: number): void => {
  const view = container.getBoundingClientRect();
  const header = container.querySelector<HTMLElement>('.gantt__header')?.offsetHeight ?? 0;
  const top = view.top + header + SCROLL_MARGIN;
  const bottom = view.top + container.clientHeight - SCROLL_MARGIN;
  const box = label.getBoundingClientRect();
  if (box.top < top) {
    container.scrollTop -= top - box.top;
  } else if (box.bottom > bottom) {
    container.scrollTop += box.bottom - bottom;
  }
  if (!bar) {
    return;
  }
  const chartWidth = container.clientWidth - listWidth;
  const left = container.scrollLeft;
  if (bar.left + bar.width < left || bar.left > left + chartWidth) {
    container.scrollLeft = Math.max(0, bar.left - BAR_MARGIN);
  }
};

/**
 * The Gantt layout: issues as a tree on the left, their plans on a time scale on the right, with
 * subtask lines and relation arrows. Rows are selected by click or arrow keys; Enter opens.
 */
export const GanttView: React.FC<Props> = props => {
  const {board, issues, universe, baseUrl, pxPerDay, onPxPerDay, size, connectorsMode, collapsed, showUndated, onToggleCollapsed, onToggleUndated} = props;
  const {selectedIds, matchIds, onSelect, onClearSelection, onOpen, registry, todaySignal, fitSignal} = props;
  const {setSelectedIds, keysEnabled, onToggleConnectors, onHelp, navMode, canEdit, onSaveEdits, onSetCollapsed} = props;
  const [now] = useState(() => Date.now());
  const today = todayPosition(now);
  const rows = useMemo(
    () => buildGanttRows({issues, gantt: board.gantt, universe, collapsed, showUndated, now}),
    [issues, board.gantt, universe, collapsed, showUndated, now]
  );
  const span = useMemo(() => ganttRange(rows, now, 0), [rows, now]);
  const scale = useMemo(() => ganttScale(ganttRange(rows, now, padDays(pxPerDay)), pxPerDay), [rows, now, pxPerDay]);
  const edges = useMemo(() => {
    if (connectorsMode === 'none') {
      return [];
    }
    const all = ganttEdges(rows, board.linkTypes);
    return connectorsMode === 'all' ? all : all.filter(edge => selectedIds.has(edge.from) || selectedIds.has(edge.to));
  }, [rows, board.linkTypes, connectorsMode, selectedIds]);
  const rowHeight = ROW_HEIGHT[size];
  const layout = useMemo(() => rowLayout(rows, rowHeight), [rows, rowHeight]);
  const height = layout.total;
  const [listWidth, setListWidth] = useState(LIST_WIDTH.initial);
  const [hover, setHover] = useState<Hover | null>(null);
  /** The row under the pointer, on either side: its label and its chart row highlight together. */
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const hoverClass = (row: GanttRow, base: string) => (row.key === hoverKey ? ` ${base}_hover` : '');
  const [showLegend, setShowLegend] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Also as state: the zoom handlers attach once the chart is drawn, which waits for the issues.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const setScrollRef = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
    setScrollElement(element);
  }, []);

  const edit = useGanttEdit({gantt: board.gantt, rows, universe, canEdit, onSave: onSaveEdits, container: scrollElement, listWidth, pxPerDay});
  const rowEditOf = (row: GanttRow): RowEdit | undefined => (row.type === 'issue' ? edit.rowEdit(row) : undefined);
  const {zoomBy} = useGanttZoom({element: scrollElement, scale, listWidth, today, span, pxPerDay, onPxPerDay, todaySignal, fitSignal});

  const hovered = hover ? rows.find((row): row is GanttIssueRow => row.type === 'issue' && row.key === hover.key) : undefined;
  // The latest rows and scale for scrolling after a key, which runs once they have rendered.
  const drawn = useRef({rows, scale, listWidth});
  drawn.current = {rows, scale, listWidth};
  const scrollToRow = useCallback((key: string) => {
    // After the selection has rendered, and any parent the key expanded.
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      const label = container?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`);
      if (!container || !label) {
        return;
      }
      const row = drawn.current.rows.find(r => r.key === key);
      revealRow(container, label, row?.type === 'issue' && row.timed ? anchorBox(drawn.current.scale, row) : undefined, drawn.current.listWidth);
    });
  }, []);

  const toggleRow = useCallback((row: GanttRow) => {
    if (row.type === 'undated') {
      onToggleUndated(undatedToggleKey(row));
    } else {
      onToggleCollapsed(row.issue.id);
    }
  }, [onToggleUndated, onToggleCollapsed]);

  const toCollapse = useMemo(() => collapseLevel(rows), [rows]);
  const toExpand = useMemo(() => expandLevel(rows), [rows]);
  const collapseOne = useCallback(() => toCollapse.length > 0 && onSetCollapsed(toCollapse, true), [toCollapse, onSetCollapsed]);
  const expandOne = useCallback(() => toExpand.length > 0 && onSetCollapsed(toExpand, false), [toExpand, onSetCollapsed]);

  useGanttKeys({
    // The confirmation takes Enter and Escape.
    enabled: keysEnabled && !edit.confirm,
    rows,
    selectedIds,
    setSelectedIds,
    cursor,
    setCursor,
    toggleRow,
    onOpen,
    zoomBy,
    onToggleConnectors,
    onHelp,
    onCollapseLevel: collapseOne,
    onExpandLevel: expandOne,
    navMode,
    scrollToRow
  });

  const onRowClick = (row: GanttRow, event: React.MouseEvent) => {
    event.stopPropagation();
    setCursor(row.key);
    if (row.type === 'issue') {
      onSelect(row.issue.id, event.ctrlKey || event.metaKey || event.shiftKey);
    } else {
      onToggleUndated(undatedToggleKey(row));
    }
  };

  const startResize = (event: React.PointerEvent) => {
    const startX = event.clientX;
    const startWidth = listWidth;
    const move = (e: PointerEvent) => setListWidth(Math.min(LIST_WIDTH.max, Math.max(LIST_WIDTH.min, startWidth + e.clientX - startX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Rows that left the chart (collapsed, filtered) leave the keyboard cursor behind.
  useEffect(() => {
    if (cursor && !rows.some(row => row.key === cursor)) {
      setCursor(null);
    }
  }, [rows, cursor]);

  const labelClass = (row: GanttRow, index: number) =>
    `${rowClass('gantt-label', row, selectedIds, matchIds, cursor)}${startsGroup(row, index) ? ' gantt-group-start' : ''}`;
  const style = {'--gantt-list-w': `${listWidth}px`, '--gantt-row-h': `${rowHeight}px`} as React.CSSProperties;

  if (rows.length === 0) {
    return <div className="board-empty">No issues to show.</div>;
  }

  return (
     
    <div
      className={`gantt gantt_${size}${edit.dragging ? ' gantt_dragging' : ''}`}
      style={style}
      role="treegrid"
      aria-label={`${board.name} Gantt chart`}
      aria-rowcount={rows.length}
      tabIndex={0}
    >
      <div className="gantt__scroll" ref={setScrollRef} onClick={onClearSelection} role="presentation">
        <div className="gantt__content" style={{width: listWidth + scale.width}}>
          <div className="gantt__header">
            <div className="gantt__corner">
              <span className="gantt__corner-title">Issue</span>
              <Button
                className="gantt__level-button"
                icon={unfoldLessIcon}
                title="Collapse one level (C)"
                aria-label="Collapse one level"
                disabled={toCollapse.length === 0}
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  collapseOne();
                }}
              />
              <Button
                className="gantt__level-button"
                icon={unfoldMoreIcon}
                title="Expand one level (Shift+C)"
                aria-label="Expand one level"
                disabled={toExpand.length === 0}
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  expandOne();
                }}
              />
              <Button
                className="gantt__legend-button"
                icon={infoIcon}
                title="Legend"
                aria-label="Legend"
                active={showLegend}
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  setShowLegend(v => !v);
                }}
              />
              {}
              <span className="gantt__resize" onPointerDown={startResize} title="Drag to resize"/>
            </div>
            <GanttScaleHeader scale={scale} today={today}/>
          </div>
          {showLegend && <GanttLegend gantt={board.gantt}/>}
          <div className="gantt__body">
            <div className="gantt__list" onMouseLeave={() => setHoverKey(null)}>
              {rows.map((row, index) => (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the treegrid takes the keys
                <div
                  key={row.key}
                  onClick={event => onRowClick(row, event)}
                  onDoubleClick={() => row.type === 'issue' && onOpen(row.issue.id)}
                  onMouseEnter={() => setHoverKey(row.key)}
                >
                  <GanttLabel
                    row={row}
                    className={`${labelClass(row, index)}${hoverClass(row, 'gantt-label')}`}
                    height={layout.heights[index]}
                    baseUrl={baseUrl}
                    focused={row.key === cursor}
                    onToggleCollapsed={onToggleCollapsed}
                    onToggleUndated={onToggleUndated}
                    registry={registry}
                  />
                </div>
              ))}
            </div>
            <div
              className="gantt__chart"
              style={{width: scale.width, height}}
              onMouseLeave={() => {
                setHover(null);
                setHoverKey(null);
              }}
            >
              <GanttGrid scale={scale} height={height} today={today}/>
              {rows.map((row, index) => (
                <ChartRow
                  key={row.key}
                  row={row}
                  className={`${rowClass('gantt-row', row, selectedIds, matchIds, cursor)}${startsGroup(row, index) ? ' gantt-group-start' : ''}${rowEditOf(row)?.saving ? ' gantt-row_saving' : ''}${hoverClass(row, 'gantt-row')}`}
                  style={{top: layout.tops[index], height: layout.heights[index], ...barStyle(row, board.cardColorField?.name ?? null)}}
                  scale={scale}
                  size={size}
                  edit={rowEditOf(row)}
                  hoverX={hover?.key === row.key ? hover.chartX : null}
                  onClick={event => onRowClick(row, event)}
                  onOpen={() => row.type === 'issue' && onOpen(row.issue.id)}
                  onHover={(event, chartX) => {
                    setHoverKey(row.key);
                    if (row.type === 'issue') {
                      setHover({key: row.key, x: event.clientX, y: event.clientY, chartX});
                    }
                  }}
                  onDraw={(event, day) => row.type === 'issue' && edit.startDraw(event, row.issue.id, day)}
                />
              ))}
              <GanttArrows rows={rows} scale={scale} size={size} edges={edges} selectedIds={selectedIds}/>
            </div>
          </div>
        </div>
      </div>
      {hovered && hover && !edit.dragging && <GanttDetails row={hovered} gantt={board.gantt} x={hover.x} y={hover.y}/>}
      {edit.dragLabel && <span className="gantt-drag-label" style={{left: edit.dragLabel.at.x + DRAG_LABEL_OFFSET, top: edit.dragLabel.at.y + DRAG_LABEL_OFFSET}}>{edit.dragLabel.text}</span>}
      {edit.confirm && <GanttConfirm {...edit.confirm}/>}
    </div>
  );
};
