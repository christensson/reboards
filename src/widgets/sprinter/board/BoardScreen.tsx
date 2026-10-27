import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {type CollisionDetection, DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors} from '@dnd-kit/core';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import {type BoardConfig, isTwoLevel, swapSwimlanes} from '@/common/model/board-config';
import type {UserPrefs} from '@/common/storage/prefs';
import {buildFieldUpdate} from '@/common/youtrack/fields';
import {errorMessage} from '@/common/youtrack/rest';
import {issueUrl, newIssueUrl} from '@/common/youtrack/urls';
import {youtrack} from '../data/api';
import {useBaseUrl} from '../data/useBaseUrl';
import {useBoardIssues} from '../data/useBoardIssues';
import {useBoardReference} from '../data/useBoardReference';
import {toggleCollapsedColumn, toggleCollapsedGroup, toggleCollapsedOuterRow, toggleCollapsedRow} from '../hooks/usePrefs';
import {computeEdges} from '../model/connectors';
import type {FieldUniverse} from '../model/fieldUniverse';
import type {BoardIssue} from '../model/issue';
import {type BoardLayout, type LayoutGroup, computeLayout, walkGroups} from '../model/layout';
import {type FieldChange, type MoveTarget, applyChanges, planMove, planRowChanges} from '../model/mutations';
import {groupDragHint, issueDragHint} from '../model/dragHint';
import {computeMatchIds} from '../model/search';
import {visibleIssueIds} from '../model/visibility';
import {BoardContext, type BoardContextValue, type CardRegistry, type DragHighlight} from './BoardContext';
import {BoardRows} from './BoardRows';
import {ColumnHeaders} from './ColumnHeaders';
import {GROUP_DRAG_PREFIX} from './GroupBox';
import {ConnectorsOverlay} from './ConnectorsOverlay';
import {IssueCardView} from './IssueCard';
import {SwimlanePickerDialog} from './SwimlanePickerDialog';
import {OUTER_WIDTH} from './tracks';
import {Toolbar} from './Toolbar';
import {ValuePickerDialog} from './ValuePickerDialog';

type Props = {
  board: BoardConfig;
  boards: BoardConfig[];
  sprint: string | null;
  prefs: UserPrefs;
  updatePrefs: (patch: Partial<UserPrefs> | ((prev: UserPrefs) => Partial<UserPrefs>)) => void;
  onSelectBoard: (boardId: string) => void;
  onSelectSprint: (sprint: string | null) => void;
  onNewBoard: () => void;
  onOpenSettings: () => void;
};

/** A drop that still needs one or two choices from the user before it is applied. */
type PendingMove = {
  issues: BoardIssue[];
  changes: FieldChange[];
  pickColumnId?: string;
  pickInner?: boolean;
  label: string;
};

const DRAG_ACTIVATION_DISTANCE = 6;

const subtaskIdsOf = (group: LayoutGroup): string[] =>
  Object.values(group.allIdsByColumn).flat().filter(id => id !== group.parentId);

/** Issues moved when a box is dragged: its subtasks, plus the parent when it is rendered in the box. */
const movedIdsOf = (group: LayoutGroup): string[] =>
  group.parentInThisRow ? [...subtaskIdsOf(group), group.parentId] : subtaskIdsOf(group);

type ActiveDrag = {issue?: BoardIssue; group?: LayoutGroup};

const describeActiveDrag = (
  activeId: string | null,
  issuesById: Map<string, BoardIssue>,
  findGroup: (key: string) => LayoutGroup | undefined
): ActiveDrag => {
  if (!activeId) {
    return {};
  }
  if (activeId.startsWith(GROUP_DRAG_PREFIX)) {
    return {group: findGroup(activeId.slice(GROUP_DRAG_PREFIX.length))};
  }
  return {issue: issuesById.get(activeId)};
};

const pickedColumn = (pending: PendingMove | null, columnById: Map<string, BoardConfig['columns'][number]>) =>
  pending?.pickColumnId ? (columnById.get(pending.pickColumnId) ?? null) : null;

const showInnerPicker = (pending: PendingMove | null): boolean => Boolean(pending?.pickInner && !pending.pickColumnId);

const DragHint: React.FC<{text: string}> = ({text}) => <div className="drag-hint">{text}</div>;

type DragPreviewProps = {
  active: ActiveDrag;
  hint: string;
  cardSize: UserPrefs['cardSize'];
  board: BoardConfig;
};

/** Content of the drag overlay: the dragged card (if any) plus the hint. */
const DragPreview: React.FC<DragPreviewProps> = ({active, hint, cardSize, board}) => {
  if (!active.issue && !active.group) {
    return null;
  }
  return (
    <div className="drag-overlay">
      {active.issue && <IssueCardView issue={active.issue} size={cardSize} cardFields={board.cardFields} cardColorField={board.cardColorField?.name} dragging/>}
      <DragHint text={hint}/>
    </div>
  );
};

type PendingMoveDialogsProps = {
  pending: PendingMove | null;
  board: BoardConfig;
  universe: FieldUniverse;
  issues: BoardIssue[];
  onPickValue: (value: string) => void;
  onPickInner: (valueKey: string | null) => void;
  onCancel: () => void;
};

/** The choices a drop may still need: a column value, then a second-level swimlane value. */
const PendingMoveDialogs: React.FC<PendingMoveDialogsProps> = ({pending, board, universe, issues, onPickValue, onPickInner, onCancel}) => {
  const columnById = new Map(board.columns.map(c => [c.id, c]));
  return (
    <>
      <ValuePickerDialog
        column={pickedColumn(pending, columnById)}
        fieldName={board.columnField.name}
        universe={universe}
        issueLabel={pending?.label ?? ''}
        onPick={onPickValue}
        onCancel={onCancel}
      />
      <SwimlanePickerDialog
        show={showInnerPicker(pending)}
        field={board.innerRow?.field ?? null}
        universe={universe}
        issues={issues}
        subjectLabel={pending?.label ?? ''}
        onPick={onPickInner}
        onCancel={onCancel}
      />
    </>
  );
};

type StatusInput = {loading: boolean; loadedCount: number; truncated: boolean};

const describeStatus = (data: StatusInput, placedCount: number, hiddenCount: number): string => {
  if (data.loading) {
    return data.loadedCount > 0 ? `Loading… ${data.loadedCount} issues` : 'Loading…';
  }
  const parts = [`${placedCount} issues`];
  if (hiddenCount > 0) {
    parts.push(`${hiddenCount} hidden`);
  }
  if (data.truncated) {
    parts.push('truncated, refine the query');
  }
  return parts.join(' · ');
};

const BASE_COLUMN_WIDTH: Record<string, number> = {small: 220, normal: 280};
const COLLAPSED_COLUMN_WIDTH = 36;

/** Column width: at least the base width, wider when the visible columns can share the viewport. */
const columnWidth = (cardSize: string, availableWidth: number, visibleColumns: number, collapsedColumns: number): number => {
  const base = BASE_COLUMN_WIDTH[cardSize] ?? BASE_COLUMN_WIDTH.normal;
  if (visibleColumns === 0 || availableWidth === 0) {
    return base;
  }
  return Math.max(base, Math.floor((availableWidth - collapsedColumns * COLLAPSED_COLUMN_WIDTH - 1) / visibleColumns));
};

/** Width left for columns once the first-level swimlane column is accounted for. */
const availableWidth = (scrollWidth: number, twoLevel: boolean): number => Math.max(0, scrollWidth - (twoLevel ? OUTER_WIDTH : 0));

/** Highlight only applicable targets: the destination cell for a card, a different swimlane for a group. */
const computeDragHighlight = (active: ActiveDrag, target: MoveTarget | null): DragHighlight | null => {
  if (!target) {
    return null;
  }
  if (active.issue) {
    return {rowKey: target.rowKey, columnId: target.columnId};
  }
  if (active.group && target.rowKey !== active.group.rowKey) {
    return {rowKey: target.rowKey, columnId: null};
  }
  return null;
};

const describeDragHint = (active: ActiveDrag, layout: BoardLayout, board: BoardConfig, universe: FieldUniverse, target: MoveTarget | null): string => {
  if (active.issue) {
    const from = layout.placement[active.issue.id];
    return from ? issueDragHint(board, universe, active.issue, from, target, layout.rowsByKey) : '';
  }
  if (active.group) {
    return groupDragHint(active.group, subtaskIdsOf(active.group).length, layout.rows, target, board.innerRow?.field?.name ?? null);
  }
  return '';
};

const screenStyle = (colWidth: number): React.CSSProperties =>
  ({'--col-w': `${colWidth}px`, '--col-c': `${COLLAPSED_COLUMN_WIDTH}px`, '--outer-w': `${OUTER_WIDTH}px`} as React.CSSProperties);

/** Tracks the inner width of the scroll container. */
const useElementWidth = (ref: React.RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
};

/** Among the drop targets under the pointer, prefer the smallest one (a cell over the band behind it). */
const mostSpecificTarget: CollisionDetection = args => {
  const collisions = pointerWithin(args);
  const area = (id: string | number): number => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
  };
  return [...collisions].sort((a, b) => area(a.id) - area(b.id));
};

const useCardRegistry = (): CardRegistry => {
  const map = useRef(new Map<string, HTMLElement>());
  return useMemo(
    () => ({
      register: (issueId, element) => {
        if (element) {
          map.current.set(issueId, element);
        } else {
          map.current.delete(issueId);
        }
      },
      get: issueId => map.current.get(issueId)
    }),
    []
  );
};

export const BoardScreen: React.FC<Props> = ({
  board: configuredBoard,
  boards,
  sprint,
  prefs,
  updatePrefs,
  onSelectBoard,
  onSelectSprint,
  onNewBoard,
  onOpenSettings
}) => {
  const swapped = Boolean(prefs.swappedSwimlanes[configuredBoard.id]);
  // The board as displayed: the two swimlane levels may be swapped per user.
  const board = useMemo(() => (swapped ? swapSwimlanes(configuredBoard) : configuredBoard), [configuredBoard, swapped]);
  const reference = useBoardReference(board.projects);
  const data = useBoardIssues(board, sprint);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<MoveTarget | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollWidth = useElementWidth(scrollRef);
  const registry = useCardRegistry();
  const baseUrl = useBaseUrl();

  const issuesById = useMemo(() => new Map(data.issues.map(i => [i.id, i])), [data.issues]);
  const layout = useMemo(
    () => computeLayout({issues: data.issues, config: board, universe: reference.universe, parents: data.parents}),
    [data.issues, board, reference.universe, data.parents]
  );
  const collapsedRows = useMemo(() => new Set(prefs.collapsedRows[board.id] ?? []), [prefs.collapsedRows, board.id]);
  const collapsedGroups = useMemo(() => new Set(prefs.collapsedGroups[board.id] ?? []), [prefs.collapsedGroups, board.id]);
  const collapsedColumns = useMemo(() => new Set(prefs.collapsedColumns[board.id] ?? []), [prefs.collapsedColumns, board.id]);
  const collapsedOuterRows = useMemo(() => new Set(prefs.collapsedOuterRows[board.id] ?? []), [prefs.collapsedOuterRows, board.id]);
  const twoLevel = isTwoLevel(board);
  const matchIds = useMemo(() => computeMatchIds(data.issues, searchTerm, quickFilter), [data.issues, searchTerm, quickFilter]);

  const visibleIds = useMemo(
    () => visibleIssueIds(layout, {rows: collapsedRows, outerRows: collapsedOuterRows, columns: collapsedColumns, groups: collapsedGroups}),
    [layout, collapsedRows, collapsedOuterRows, collapsedColumns, collapsedGroups]
  );
  const edges = useMemo(() => computeEdges(data.issues, visibleIds, board.linkTypes), [data.issues, visibleIds, board.linkTypes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSelect = useCallback((issueId: string, additive: boolean) => {
    setSelectedIds(prev => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (prev.has(issueId) && (additive || prev.size === 1)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }, []);

  const onOpen = useCallback(
    (issueId: string) => {
      const idReadable = issuesById.get(issueId)?.idReadable ?? data.parents[issueId]?.idReadable;
      if (idReadable) {
        window.open(issueUrl(baseUrl, idReadable), '_blank', 'noopener');
      }
    },
    [issuesById, data.parents, baseUrl]
  );

  const columnById = useMemo(() => new Map(board.columns.map(c => [c.id, c])), [board.columns]);
  const newIssueHref = useCallback(
    (rowKey: string, columnId: string): string | null => {
      const project = board.projects[0];
      const column = columnById.get(columnId);
      if (!project || !column || column.values.length === 0) {
        return null;
      }
      const presets = [{field: board.columnField.name, value: column.values[0]}];
      const row = layout.rowsByKey[rowKey];
      if (board.innerRow?.field && row?.innerValue) {
        presets.unshift({field: board.innerRow.field.name, value: row.innerValue});
      }
      if (board.row.field && row?.outerValue) {
        presets.unshift({field: board.row.field.name, value: row.outerValue});
      }
      return newIssueUrl(baseUrl, project.shortName, presets);
    },
    [board, columnById, baseUrl, layout.rowsByKey]
  );

  const expandFor = useCallback(
    (issueId: string) => {
      const p = layout.placement[issueId];
      if (!p) {
        return;
      }
      const toExpand = new Set([...(layout.groupAncestors[p.groupKey ?? ''] ?? []), p.groupKey ?? '']);
      const outerKey = layout.rowsByKey[p.rowKey]?.outerKey;
      updatePrefs(prev => {
        const rows = (prev.collapsedRows[board.id] ?? []).filter(k => k !== p.rowKey);
        const groups = (prev.collapsedGroups[board.id] ?? []).filter(k => !toExpand.has(k));
        const columns = (prev.collapsedColumns[board.id] ?? []).filter(k => k !== p.columnId);
        const outer = (prev.collapsedOuterRows[board.id] ?? []).filter(k => k !== outerKey);
        return {
          collapsedRows: {...prev.collapsedRows, [board.id]: rows},
          collapsedGroups: {...prev.collapsedGroups, [board.id]: groups},
          collapsedColumns: {...prev.collapsedColumns, [board.id]: columns},
          collapsedOuterRows: {...prev.collapsedOuterRows, [board.id]: outer}
        };
      });
    },
    [layout.placement, layout.groupAncestors, layout.rowsByKey, updatePrefs, board.id]
  );

  const onSearchSubmit = useCallback(() => {
    const ids = Array.from(matchIds);
    setSelectedIds(new Set(ids));
    if (ids.length === 0) {
      return;
    }
    ids.forEach(expandFor);
    const SCROLL_DELAY = 50;
    window.setTimeout(() => {
      registry.get(ids[0])?.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'});
    }, SCROLL_DELAY);
  }, [matchIds, expandFor, registry]);

  const applyMove = useCallback(
    async (issue: BoardIssue, changes: FieldChange[]) => {
      if (changes.length === 0) {
        return;
      }
      const optimistic = applyChanges(issue, changes, reference.universe);
      data.replaceIssue(optimistic);
      try {
        const updates = changes.map(change =>
          buildFieldUpdate(change.field.name, change.field.kind, issue.fields[change.field.name]?.$type, change.valueKey)
        );
        await youtrack.updateIssueFields(issue.id, updates);
        await data.refetchIssue(issue.id);
      } catch (failure) {
        data.replaceIssue(issue);
        alertService.error(`Could not move ${issue.idReadable}: ${errorMessage(failure)}`);
      }
    },
    [data, reference.universe]
  );

  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: DRAG_ACTIVATION_DISTANCE}}));

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setDragTarget(null);
  }, []);
  const onDragOver = useCallback((event: DragOverEvent) => setDragTarget((event.over?.data.current as MoveTarget | undefined) ?? null), []);
  const findGroup = useCallback(
    (groupKey: string): LayoutGroup | undefined => {
      let found: LayoutGroup | undefined;
      walkGroups(layout.rows.flatMap(r => r.groups), group => {
        if (group.key === groupKey) {
          found = group;
        }
      });
      return found;
    },
    [layout.rows]
  );

  /** Applies a pending move to every issue in it, or asks for the next missing choice. */
  const settlePending = useCallback(
    (pending: PendingMove) => {
      if (pending.pickColumnId || pending.pickInner) {
        setPendingMove(pending);
        return;
      }
      setPendingMove(null);
      pending.issues.forEach(issue => applyMove(issue, pending.changes));
    },
    [applyMove]
  );

  /** Moves every subtask inside a box to another swimlane; the column never changes. */
  const moveGroup = useCallback(
    (groupKey: string, target: MoveTarget) => {
      const group = findGroup(groupKey);
      if (!group || target.rowKey === group.rowKey) {
        return;
      }
      const rowPlan = planRowChanges(board, group.rowKey, target.rowKey, layout.rowsByKey);
      if (rowPlan.changes.length === 0 && !rowPlan.pickInnerValue) {
        return;
      }
      const issues = movedIdsOf(group).map(id => issuesById.get(id)).filter((i): i is BoardIssue => Boolean(i));
      settlePending({issues, changes: rowPlan.changes, pickInner: rowPlan.pickInnerValue, label: `subtasks of ${group.parentIdReadable}`});
    },
    [findGroup, board, layout.rowsByKey, issuesById, settlePending]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setDragTarget(null);
      const activeId = String(event.active.id);
      const target = event.over?.data.current as MoveTarget | undefined;
      if (activeId.startsWith(GROUP_DRAG_PREFIX)) {
        if (target) {
          moveGroup(activeId.slice(GROUP_DRAG_PREFIX.length), target);
        }
        return;
      }
      const issueId = activeId;
      const issue = issuesById.get(issueId);
      const from = layout.placement[issueId];
      if (!issue || !from || !target) {
        return;
      }
      const plan = planMove(board, from, target, layout.rowsByKey);
      settlePending({issues: [issue], changes: plan.changes, pickColumnId: plan.pickColumn?.id, pickInner: plan.pickInnerValue, label: issue.idReadable});
    },
    [issuesById, layout.placement, layout.rowsByKey, board, settlePending, moveGroup]
  );

  const onPickValue = useCallback(
    (value: string) => {
      if (!pendingMove) {
        return;
      }
      settlePending({...pendingMove, changes: [...pendingMove.changes, {field: board.columnField, valueKey: value}], pickColumnId: undefined});
    },
    [pendingMove, board.columnField, settlePending]
  );

  const onPickInner = useCallback(
    (valueKey: string | null) => {
      if (!pendingMove || !board.innerRow?.field) {
        return;
      }
      settlePending({...pendingMove, changes: [...pendingMove.changes, {field: board.innerRow.field, valueKey}], pickInner: false});
    },
    [pendingMove, board.innerRow, settlePending]
  );

  const columnLabelOf = useCallback((columnId: string) => layout.columns.find(c => c.id === columnId)?.label ?? '', [layout.columns]);

  const activeDrag = useMemo(() => describeActiveDrag(activeDragId, issuesById, findGroup), [activeDragId, issuesById, findGroup]);
  const dragHighlight = useMemo(() => computeDragHighlight(activeDrag, dragTarget), [activeDrag, dragTarget]);

  const contextValue = useMemo<BoardContextValue>(
    () => ({
      dragHighlight,
      issuesById,
      cardSize: prefs.cardSize,
      cardFields: board.cardFields,
      cardColorField: board.cardColorField?.name ?? null,
      collapsedColumns,
      selectedIds,
      matchIds,
      searchTerm,
      onSelect,
      onOpen,
      newIssueHref,
      registry,
      columnLabel: columnLabelOf
    }),
    [dragHighlight, issuesById, prefs.cardSize, board.cardFields, board.cardColorField, collapsedColumns, selectedIds, matchIds, searchTerm, onSelect, onOpen, newIssueHref, registry, columnLabelOf]
  );

  const status = useMemo(
    () => describeStatus(data, Object.keys(layout.placement).length, layout.hiddenIssueIds.length),
    [data, layout]
  );

  const dragHint = useMemo(() => describeDragHint(activeDrag, layout, board, reference.universe, dragTarget), [activeDrag, layout, board, reference.universe, dragTarget]);
  const error = reference.error ?? data.error;
  const colWidth = columnWidth(prefs.cardSize, availableWidth(scrollWidth, twoLevel), layout.columns.length - collapsedColumns.size, collapsedColumns.size);
  const layoutVersion = useMemo(
    () => [layout, prefs.cardSize, collapsedRows, collapsedOuterRows, collapsedGroups, collapsedColumns, colWidth, data.loading],
    [layout, prefs.cardSize, collapsedRows, collapsedOuterRows, collapsedGroups, collapsedColumns, colWidth, data.loading]
  );
  const onToggleRow = useCallback((rowKey: string) => updatePrefs(prev => toggleCollapsedRow(prev, board.id, rowKey)), [updatePrefs, board.id]);
  const onToggleGroup = useCallback((groupKey: string) => updatePrefs(prev => toggleCollapsedGroup(prev, board.id, groupKey)), [updatePrefs, board.id]);
  const onToggleOuter = useCallback((outerKey: string) => updatePrefs(prev => toggleCollapsedOuterRow(prev, board.id, outerKey)), [updatePrefs, board.id]);

  return (
    <div className={`board-screen${twoLevel ? ' board-screen_two-level' : ''}`} style={screenStyle(colWidth)}>
      <Toolbar
        boards={boards}
        board={board}
        universe={reference.universe}
        sprint={sprint}
        searchTerm={searchTerm}
        quickFilter={quickFilter}
        onQuickFilter={setQuickFilter}
        cardSize={prefs.cardSize}
        connectorsMode={prefs.connectorsMode}
        loading={data.loading || reference.loading}
        status={status}
        onSelectBoard={onSelectBoard}
        onNewBoard={onNewBoard}
        onOpenSettings={onOpenSettings}
        onSelectSprint={onSelectSprint}
        onSearchChange={setSearchTerm}
        onSearchSubmit={onSearchSubmit}
        onCardSize={size => updatePrefs({cardSize: size})}
        onConnectorsMode={mode => updatePrefs({connectorsMode: mode})}
        onRefresh={() => {
          reference.reload();
          data.refresh();
        }}
      />
      {error && <div className="board-error">{error}</div>}
      {board.columns.length === 0 && !error && (
        <div className="board-empty">This board has no columns yet. Open the board settings to configure columns.</div>
      )}
      <BoardContext.Provider value={contextValue}>
        <DndContext
          sensors={sensors}
          collisionDetection={mostSpecificTarget}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            setDragTarget(null);
          }}
        >
          <div className="board-scroll" ref={scrollRef} onClick={() => setSelectedIds(new Set())} role="presentation">
            <div className="board-content" ref={contentRef}>
              <ColumnHeaders
                columns={layout.columns}
                columnFieldName={board.columnField.name}
                universe={reference.universe}
                collapsedColumns={collapsedColumns}
                onToggleColumn={columnId => updatePrefs(prev => toggleCollapsedColumn(prev, board.id, columnId))}
                twoLevel={twoLevel}
                swappedSwimlanes={swapped}
                onToggleSwappedSwimlanes={() => updatePrefs(prev => ({swappedSwimlanes: {...prev.swappedSwimlanes, [board.id]: !swapped}}))}
              />
              <BoardRows
                layout={layout}
                collapsedRows={collapsedRows}
                collapsedOuterRows={collapsedOuterRows}
                collapsedGroups={collapsedGroups}
                onToggleRow={onToggleRow}
                onToggleOuter={onToggleOuter}
                onToggleGroup={onToggleGroup}
              />
              <ConnectorsOverlay
                edges={edges}
                selectedIds={selectedIds}
                mode={prefs.connectorsMode}
                contentRef={contentRef}
                registry={registry}
                layoutVersion={layoutVersion}
              />
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            <DragPreview active={activeDrag} hint={dragHint} cardSize={prefs.cardSize} board={board}/>
          </DragOverlay>
        </DndContext>
      </BoardContext.Provider>
      <PendingMoveDialogs
        pending={pendingMove}
        board={board}
        universe={reference.universe}
        issues={data.issues}
        onPickValue={onPickValue}
        onPickInner={onPickInner}
        onCancel={() => setPendingMove(null)}
      />
    </div>
  );
};
