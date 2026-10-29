import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors} from '@dnd-kit/core';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import {type BoardConfig, type DynamicOptions, type FieldRef, isDynamicField, isTwoLevel, swapSwimlanes} from '@/common/model/board-config';
import {type UserPrefs, boardView, setBoardView, toggleStar} from '@/common/storage/prefs';
import {buildFieldUpdate, buildMultiFieldUpdate} from '@/common/youtrack/fields';
import {errorMessage} from '@/common/youtrack/rest';
import {issueUrl, newIssueUrl} from '@/common/youtrack/urls';
import {youtrack} from '../data/api';
import {useBaseUrl} from '../data/useBaseUrl';
import {useBoardIssues} from '../data/useBoardIssues';
import {useBoardReference} from '../data/useBoardReference';
import {toggleCollapsedColumn, toggleCollapsedGroup, toggleCollapsedOuterRow, toggleCollapsedRow} from '../hooks/usePrefs';
import {computeEdges} from '../model/connectors';
import type {FieldUniverse} from '../model/fieldUniverse';
import {sprintForDate} from '../model/sprints';
import type {BoardIssue} from '../model/issue';
import {type BoardLayout, type CardPlacement, type LayoutGroup, type Placement, cardLocation, computeLayout, revealColumnIds, walkGroups} from '../model/layout';
import {type FieldChange, type MoveTarget, type ValueChoice, applyChanges, keysAfter, planMove, planRowChanges} from '../model/mutations';
import {groupDragHint, issueDragHint, linkDragHint} from '../model/dragHint';
import {isLinkDropData} from '../model/linkTargets';
import {computeMatchIds} from '../model/search';
import {visibleIssueIds} from '../model/visibility';
import {BoardContext, type BoardContextValue, type CardRegistry, type DragHighlight} from './BoardContext';
import {BoardRows} from './BoardRows';
import {ColumnHeaders} from './ColumnHeaders';
import {GROUP_DRAG_PREFIX} from './GroupBox';
import {ConnectorsOverlay} from './ConnectorsOverlay';
import {IssueCardView} from './IssueCard';
import {FieldValuePickerDialog} from './FieldValuePickerDialog';
import {OUTER_WIDTH} from './tracks';
import {Toolbar} from './Toolbar';
import {ValuePickerDialog} from './ValuePickerDialog';
import {RelationPickerDialog} from './RelationPickerDialog';
import {useLinkDrag} from './useLinkDrag';
import {useProjectPermissions} from '../data/useProjectPermissions';
import {QuickFind} from './QuickFind';
import {useQuickFind} from './useQuickFind';

type Props = {
  board: BoardConfig;
  boards: BoardConfig[];
  sprint: string | null;
  prefs: UserPrefs;
  updatePrefs: (patch: Partial<UserPrefs> | ((prev: UserPrefs) => Partial<UserPrefs>)) => void;
  onSelectBoard: (boardId: string) => void;
  onSelectSprint: (sprint: string | null) => void;
  /** Shows a sprint picked automatically (by date) without remembering it. */
  onAutoSelectSprint: (sprint: string) => void;
  onNewBoard: () => void;
  onOpenSettings: () => void;
};

/** A drop that still needs one or two choices from the user before it is applied. */
type PendingMove = {
  issues: BoardIssue[];
  changes: FieldChange[];
  pickColumnId?: string;
  /** Values still to pick, in order, after any column value. */
  choices: ValueChoice[];
  label: string;
};

const DRAG_ACTIVATION_DISTANCE = 6;

const subtaskIdsOf = (group: LayoutGroup): string[] =>
  Object.values(group.allIdsByColumn).flat().filter(id => id !== group.parentId);

/** Issues moved when a box is dragged: its subtasks, plus the parent when it is rendered in the box. */
const movedIdsOf = (group: LayoutGroup): string[] =>
  group.parentInThisRow ? [...subtaskIdsOf(group), group.parentId] : subtaskIdsOf(group);

type ActiveDrag = {issue?: BoardIssue; card?: CardPlacement; group?: LayoutGroup};

const describeActiveDrag = (
  activeId: string | null,
  issuesById: Map<string, BoardIssue>,
  cards: Record<string, CardPlacement>,
  findGroup: (key: string) => LayoutGroup | undefined
): ActiveDrag => {
  if (!activeId) {
    return {};
  }
  if (activeId.startsWith(GROUP_DRAG_PREFIX)) {
    return {group: findGroup(activeId.slice(GROUP_DRAG_PREFIX.length))};
  }
  // Card ids differ from issue ids for the extra cards of multi-value fields.
  const card = cards[activeId];
  return {issue: issuesById.get(card?.issueId ?? activeId), card};
};

const pickedColumn = (pending: PendingMove | null, columnById: Map<string, BoardConfig['columns'][number]>) =>
  pending?.pickColumnId ? (columnById.get(pending.pickColumnId) ?? null) : null;

const pendingChoice = (pending: PendingMove | null): ValueChoice | null =>
  pending && !pending.pickColumnId ? (pending.choices[0] ?? null) : null;

/** Values all the moved issues have, checked to start with when picking several values. */
const commonKeys = (issues: BoardIssue[], fieldName: string): string[] => {
  const [first, ...others] = issues.map(issue => issue.fields[fieldName]?.keys ?? []);
  return (first ?? []).filter(key => others.every(keys => keys.includes(key)));
};

/** Filter and sort of the dynamic field picked on drop: the column field's or a swimlane level's. */
const choiceOptions = (board: BoardConfig, field: FieldRef | null): DynamicOptions | undefined => {
  if (!field) {
    return undefined;
  }
  if (field.name === board.columnField.name) {
    return board.columnOptions;
  }
  return field.name === board.row.field?.name ? board.row.dynamic : board.innerRow?.dynamic;
};

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
  onPickChoice: (picked: string | null | string[]) => void;
  onCancel: () => void;
};

/** The choices a drop may still need: a column value, then values of "Assign…" columns and swimlanes. */
const PendingMoveDialogs: React.FC<PendingMoveDialogsProps> = ({pending, board, universe, issues, onPickValue, onPickChoice, onCancel}) => {
  const columnById = new Map(board.columns.map(c => [c.id, c]));
  const choice = pendingChoice(pending);
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
      <FieldValuePickerDialog
        show={Boolean(choice)}
        field={choice?.field ?? null}
        universe={universe}
        issues={issues}
        options={choiceOptions(board, choice?.field ?? null)}
        subjectLabel={pending?.label ?? ''}
        currentKeys={choice ? commonKeys(pending?.issues ?? [], choice.field.name) : []}
        onPick={onPickChoice}
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
const columnWidth = (cardSize: string, availableWidth: number, visibleColumns: number, narrowColumns: number): number => {
  const base = BASE_COLUMN_WIDTH[cardSize] ?? BASE_COLUMN_WIDTH.normal;
  if (visibleColumns === 0 || availableWidth === 0) {
    return base;
  }
  return Math.max(base, Math.floor((availableWidth - narrowColumns * COLLAPSED_COLUMN_WIDTH - 1) / visibleColumns));
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
    const from = active.card ?? layout.placement[active.issue.id];
    return from ? issueDragHint(board, universe, active.issue, from, target, layout.rowsByKey, layout.columns) : '';
  }
  if (active.group) {
    return groupDragHint(active.group, subtaskIdsOf(active.group).length, layout.rows, target, board.innerRow?.field?.name ?? null, board.row.field?.name ?? null);
  }
  return '';
};

/**
 * Root classes of the board. During a plain drag (no Ctrl or Ctrl+Shift), which changes fields,
 * the "Assign…" targets show their labels.
 */
const screenClass = (twoLevel: boolean, active: ActiveDrag, plainDrag: boolean): string => {
  const moving = Boolean(active.issue || active.group) && plainDrag;
  return ['board-screen', twoLevel ? 'board-screen_two-level' : '', moving ? 'board-screen_moving' : ''].filter(Boolean).join(' ');
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

/** Selects the sprint whose date range contains today when neither the URL nor storage names one. */
const useAutoSprint = (
  board: BoardConfig,
  sprint: string | null,
  hasStoredSprint: boolean,
  reference: {loading: boolean; universe: FieldUniverse},
  onAutoSelectSprint: (sprint: string) => void
) => {
  const fieldName = board.sprints.enabled ? board.sprints.field?.name : undefined;
  const values = fieldName ? reference.universe.byName.get(fieldName)?.values : undefined;
  useEffect(() => {
    if (sprint !== null || hasStoredSprint || reference.loading || !values) {
      return;
    }
    const current = sprintForDate(values, Date.now());
    if (current) {
      onAutoSelectSprint(current);
    }
  }, [sprint, hasStoredSprint, reference.loading, values, onAutoSelectSprint]);
};

export const BoardScreen: React.FC<Props> = ({
  board: configuredBoard,
  boards,
  sprint,
  prefs,
  updatePrefs,
  onSelectBoard,
  onSelectSprint,
  onAutoSelectSprint,
  onNewBoard,
  onOpenSettings
}) => {
  const swapped = Boolean(prefs.swappedSwimlanes[configuredBoard.id]);
  // The board as displayed: the two swimlane levels may be swapped per user.
  const board = useMemo(() => (swapped ? swapSwimlanes(configuredBoard) : configuredBoard), [configuredBoard, swapped]);
  const reference = useBoardReference(board.projects);
  const data = useBoardIssues(board, sprint);
  const view = boardView(prefs, board.id);
  useAutoSprint(board, sprint, board.id in prefs.lastSprintByBoard, reference, onAutoSelectSprint);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
    () => computeLayout({
      issues: data.issues,
      config: board,
      universe: reference.universe,
      parents: data.parents,
      visibleColumnIds: prefs.visibleColumns[board.id]
    }),
    [data.issues, board, reference.universe, data.parents, prefs.visibleColumns]
  );
  const collapsedRows = useMemo(() => new Set(prefs.collapsedRows[board.id] ?? []), [prefs.collapsedRows, board.id]);
  const collapsedGroups = useMemo(() => new Set(prefs.collapsedGroups[board.id] ?? []), [prefs.collapsedGroups, board.id]);
  const collapsedColumns = useMemo(() => new Set(prefs.collapsedColumns[board.id] ?? []), [prefs.collapsedColumns, board.id]);
  const collapsedOuterRows = useMemo(() => new Set(prefs.collapsedOuterRows[board.id] ?? []), [prefs.collapsedOuterRows, board.id]);
  const twoLevel = isTwoLevel(board);
  // Toolbar count: issues highlighted by the "No <field>" quick filter alone.
  const highlightIds = useMemo(() => computeMatchIds(data.issues, '', quickFilter), [data.issues, quickFilter]);
  // While the "/" find box is open, its text drives matching and highlighting instead of the toolbar's.
  const [quickFindTerm, setQuickFindTerm] = useState<string | null>(null);
  const activeTerm = quickFindTerm ?? '';
  const matchIds = useMemo(
    () => (quickFindTerm === null ? highlightIds : computeMatchIds(data.issues, quickFindTerm, quickFilter)),
    [quickFindTerm, highlightIds, data.issues, quickFilter]
  );

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

  const newIssueHref = useCallback(
    (rowKey: string, columnId: string, parentIdReadable?: string): string | null => {
      const project = board.projects[0];
      const column = layout.columns.find(c => c.id === columnId);
      // The "Assign <field>…" column never holds issues; the "No <field>" column presets nothing.
      if (!view.showNewIssue || !project || !column || column.assign) {
        return null;
      }
      const value = column.values[0];
      const presets = value === undefined ? [] : [{field: board.columnField.name, value}];
      const row = layout.rowsByKey[rowKey];
      if (board.innerRow?.field && row?.innerValue) {
        presets.unshift({field: board.innerRow.field.name, value: row.innerValue});
      }
      if (board.row.field && row?.outerValue) {
        presets.unshift({field: board.row.field.name, value: row.outerValue});
      }
      return newIssueUrl(baseUrl, project.shortName, presets, parentIdReadable ? [`subtask of ${parentIdReadable}`] : []);
    },
    [board, baseUrl, layout.columns, layout.rowsByKey, view.showNewIssue]
  );

  /** Expands the swimlanes, column and boxes that hide a card at this placement. */
  const expandPlacement = useCallback(
    (p: Placement) => {
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
    [layout.groupAncestors, layout.rowsByKey, updatePrefs, board.id]
  );

  const expandFor = useCallback(
    (issueId: string) => {
      const p = layout.placement[issueId];
      if (p) {
        expandPlacement(p);
      }
    },
    [layout.placement, expandPlacement]
  );

  const showCard = useCallback(
    (cardId: string) => {
      const card = layout.cards[cardId];
      if (!card) {
        return;
      }
      // A primary card may sit in a subtask box; its placement knows which.
      expandPlacement(layout.placement[cardId] ?? card);
      // Scroll once whatever was collapsed has rendered.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const element = contentRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
        if (!element) {
          return;
        }
        element.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'});
        element.classList.remove('issue-card_flash');
        // Reading the layout restarts the flash animation when the same card is shown again.
        element.getBoundingClientRect();
        element.classList.add('issue-card_flash');
      }));
    },
    [layout.cards, layout.placement, expandPlacement]
  );
  const cardCopies = useCallback((issueId: string) => layout.copiesByIssue[issueId] ?? [], [layout.copiesByIssue]);
  const locateCard = useCallback((cardId: string) => cardLocation(layout, cardId), [layout]);

  /** Selects the current matches, expands what hides them and scrolls to the first; returns whether anything was selected. */
  const selectMatches = useCallback((): boolean => {
    const ids = Array.from(matchIds);
    setSelectedIds(new Set(ids));
    if (ids.length === 0) {
      return false;
    }
    ids.forEach(expandFor);
    const SCROLL_DELAY = 50;
    window.setTimeout(() => {
      registry.get(ids[0])?.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'smooth'});
    }, SCROLL_DELAY);
    return true;
  }, [matchIds, expandFor, registry]);

  // Opened from the toolbar menu: wait a tick so the closing menu's focus change can't blur the new box.
  const onOpenQuickFind = useCallback(() => {
    window.setTimeout(() => setQuickFindTerm(''), 0);
  }, []);


  const applyMove = useCallback(
    async (issue: BoardIssue, changes: FieldChange[]) => {
      if (changes.length === 0) {
        return;
      }
      const optimistic = applyChanges(issue, changes, reference.universe);
      data.replaceIssue(optimistic);
      try {
        const updates = changes.map(change => {
          const currentType = issue.fields[change.field.name]?.$type;
          return reference.universe.byName.get(change.field.name)?.multi
            ? buildMultiFieldUpdate(change.field.name, change.field.kind, currentType, keysAfter(issue, change, reference.universe))
            : buildFieldUpdate(change.field.name, change.field.kind, currentType, change.valueKey);
        });
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

  const permissions = useProjectPermissions(board.projects);
  const canUpdateIssue = useCallback((issue: BoardIssue) => permissions.canUpdate(issue.projectShortName), [permissions]);
  const canLinkIssue = useCallback((issue: BoardIssue) => permissions.canLink(issue.projectShortName), [permissions]);
  const canDrag = useCallback(
    (issueId: string) => {
      const issue = issuesById.get(issueId);
      return !issue || canUpdateIssue(issue) || canLinkIssue(issue);
    },
    [issuesById, canUpdateIssue, canLinkIssue]
  );

  const link = useLinkDrag({issuesById, linkTypes: reference.linkTypes, data, canLink: canLinkIssue});
  useQuickFind(quickFindTerm, setQuickFindTerm, matchIds, registry, pendingMove !== null || link.dialog.from !== null);
  const {start: startLinkDrag, onOver: onLinkOver, end: endLinkDrag, drop: dropLink} = link;

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = String(event.active.id);
      setActiveDragId(activeId);
      setDragTarget(null);
      startLinkDrag(event, !activeId.startsWith(GROUP_DRAG_PREFIX));
    },
    [startLinkDrag]
  );
  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const over = event.over?.data.current;
      onLinkOver(over);
      setDragTarget(isLinkDropData(over) ? null : ((over as MoveTarget | undefined) ?? null));
    },
    [onLinkOver]
  );
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
      if (pending.pickColumnId || pending.choices.length > 0) {
        setPendingMove(pending);
        return;
      }
      setPendingMove(null);
      pending.issues.forEach(issue => applyMove(issue, pending.changes));
      // A value assigned through "Assign <field>…" may have a column that is not shown: show it.
      const columnChange = pending.changes.find(change => change.field.name === board.columnField.name);
      // Only added values may need a column; unchecking alone never does.
      const assigned = columnChange?.delta?.add ?? (columnChange?.valueKey ? [columnChange.valueKey] : []);
      const reveal = columnChange && !(columnChange.delta && assigned.length === 0) ? revealColumnIds(layout.columns, assigned) : null;
      if (reveal) {
        updatePrefs(prev => ({visibleColumns: {...prev.visibleColumns, [board.id]: reveal}}));
      }
    },
    [applyMove, board.columnField.name, board.id, layout.columns, updatePrefs]
  );

  /** Moves every subtask inside a box to another swimlane; the column never changes. */
  const moveGroup = useCallback(
    (groupKey: string, target: MoveTarget) => {
      const group = findGroup(groupKey);
      if (!group || target.rowKey === group.rowKey) {
        return;
      }
      const rowPlan = planRowChanges(board, group.rowKey, target.rowKey, layout.rowsByKey);
      if (rowPlan.changes.length === 0 && !rowPlan.choices) {
        return;
      }
      const all = movedIdsOf(group).map(id => issuesById.get(id)).filter((i): i is BoardIssue => Boolean(i));
      const issues = all.filter(canUpdateIssue);
      if (issues.length < all.length) {
        alertService.warning(`Skipped ${all.length - issues.length} subtask(s) you do not have permission to change`);
      }
      if (issues.length === 0) {
        return;
      }
      settlePending({issues, changes: rowPlan.changes, choices: rowPlan.choices ?? [], label: `subtasks of ${group.parentIdReadable}`});
    },
    [findGroup, board, layout.rowsByKey, issuesById, settlePending, canUpdateIssue]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setDragTarget(null);
      const activeId = String(event.active.id);
      // The card dragged: an issue's primary card (id = issue id) or an extra card of a multi-value field.
      const card = layout.cards[activeId];
      // Ctrl / Ctrl+Shift drags change the parent or add a relation, never fields.
      if (dropLink(activeId.startsWith(GROUP_DRAG_PREFIX) ? undefined : issuesById.get(card?.issueId ?? activeId))) {
        return;
      }
      const target = event.over?.data.current as MoveTarget | undefined;
      if (activeId.startsWith(GROUP_DRAG_PREFIX)) {
        if (target) {
          moveGroup(activeId.slice(GROUP_DRAG_PREFIX.length), target);
        }
        return;
      }
      const issue = card && issuesById.get(card.issueId);
      const from = card;
      if (!issue || !from || !target) {
        return;
      }
      if (!canUpdateIssue(issue)) {
        alertService.warning(`You do not have permission to change ${issue.idReadable}`);
        return;
      }
      const plan = planMove(board, from, target, layout.rowsByKey, layout.columns);
      settlePending({issues: [issue], changes: plan.changes, pickColumnId: plan.pickColumn?.id, choices: plan.choices ?? [], label: issue.idReadable});
    },
    [issuesById, layout.cards, layout.rowsByKey, layout.columns, board, settlePending, moveGroup, dropLink, canUpdateIssue]
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

  /** A value picked for a single-value field, or the values checked for a multi-value one. */
  const onPickChoice = useCallback(
    (picked: string | null | string[]) => {
      const [choice, ...rest] = pendingMove?.choices ?? [];
      if (!pendingMove || !choice) {
        return;
      }
      // The dialog started with the values all moved issues share; apply what changed from those.
      const before = commonKeys(pendingMove.issues, choice.field.name);
      const change: FieldChange = Array.isArray(picked)
        ? {
          field: choice.field,
          valueKey: picked[0] ?? null,
          delta: {add: picked.filter(key => !before.includes(key)), remove: before.filter(key => !picked.includes(key))}
        }
        : {field: choice.field, valueKey: picked, ...(choice.replaceKey === undefined ? {} : {replaceKey: choice.replaceKey})};
      settlePending({...pendingMove, changes: [...pendingMove.changes, change], choices: rest});
    },
    [pendingMove, settlePending]
  );

  const canMoveGroup = useCallback(
    (group: LayoutGroup) => movedIdsOf(group).some(id => {
      const issue = issuesById.get(id);
      return !issue || canUpdateIssue(issue);
    }),
    [issuesById, canUpdateIssue]
  );

  const columnLabelOf = useCallback((columnId: string) => layout.columns.find(c => c.id === columnId)?.label ?? '', [layout.columns]);

  const issueIdOf = useCallback((id: string) => layout.cards[id]?.issueId ?? id, [layout.cards]);

  /** Keeps the user's column pick for this board; an empty pick or a reset goes back to the default columns. */
  const pickColumns = useCallback(
    (columnIds: string[] | null) =>
      updatePrefs(prev => {
        const {[board.id]: _previous, ...others} = prev.visibleColumns;
        return {visibleColumns: columnIds && columnIds.length > 0 ? {...others, [board.id]: columnIds} : others};
      }),
    [updatePrefs, board.id]
  );

  const activeDrag = useMemo(() => describeActiveDrag(activeDragId, issuesById, layout.cards, findGroup), [activeDragId, issuesById, layout.cards, findGroup]);
  const dragHighlight = useMemo(() => (link.mode === 'none' ? computeDragHighlight(activeDrag, dragTarget) : null), [link.mode, activeDrag, dragTarget]);

  const stateFieldNames = useMemo(
    () => [board.columnField, board.row.field, board.innerRow?.field].filter((f): f is FieldRef => f?.kind === 'state').map(f => f.name),
    [board.columnField, board.row.field, board.innerRow]
  );

  const contextValue = useMemo<BoardContextValue>(
    () => ({
      dragHighlight,
      linkHighlight: link.highlight,
      issuesById,
      cardSize: view.cardSize,
      cardFields: board.cardFields,
      cardColorField: board.cardColorField?.name ?? null,
      stateFieldNames,
      collapsedColumns,
      selectedIds,
      matchIds,
      searchTerm: activeTerm,
      onSelect,
      onOpen,
      newIssueHref,
      registry,
      columnLabel: columnLabelOf,
      canDrag,
      canMoveGroup,
      issueIdOf,
      cardCopies,
      cardLocation: locateCard,
      showCard
    }),
    [dragHighlight, link.highlight, issuesById, view.cardSize, board.cardFields, board.cardColorField, stateFieldNames, collapsedColumns, selectedIds, matchIds, activeTerm, onSelect, onOpen, newIssueHref, registry, columnLabelOf, canDrag, canMoveGroup, issueIdOf, cardCopies, locateCard, showCard]
  );

  const status = useMemo(
    () => describeStatus(data, Object.keys(layout.placement).length, layout.hiddenIssueIds.length),
    [data, layout]
  );

  const linkTargetOf = link.target;
  const dragHint = useMemo(
    () =>
      link.mode !== 'none' && activeDrag.issue
        ? linkDragHint(link.mode, activeDrag.issue, linkTargetOf(activeDrag.issue))
        : describeDragHint(activeDrag, layout, board, reference.universe, dragTarget),
    [link.mode, linkTargetOf, activeDrag, layout, board, reference.universe, dragTarget]
  );
  const error = reference.error ?? data.error;
  // The "Assign <field>…" column is as narrow as a collapsed one.
  const assignColumns = layout.columns.filter(c => c.assign).length;
  const colWidth = columnWidth(
    view.cardSize,
    availableWidth(scrollWidth, twoLevel),
    layout.columns.length - collapsedColumns.size - assignColumns,
    collapsedColumns.size + assignColumns
  );
  const layoutVersion = useMemo(
    () => [layout, view.cardSize, collapsedRows, collapsedOuterRows, collapsedGroups, collapsedColumns, colWidth, data.loading],
    [layout, view.cardSize, collapsedRows, collapsedOuterRows, collapsedGroups, collapsedColumns, colWidth, data.loading]
  );
  const onToggleRow = useCallback((rowKey: string) => updatePrefs(prev => toggleCollapsedRow(prev, board.id, rowKey)), [updatePrefs, board.id]);
  const onToggleGroup = useCallback((groupKey: string) => updatePrefs(prev => toggleCollapsedGroup(prev, board.id, groupKey)), [updatePrefs, board.id]);
  const onToggleOuter = useCallback((outerKey: string) => updatePrefs(prev => toggleCollapsedOuterRow(prev, board.id, outerKey)), [updatePrefs, board.id]);

  return (
    <div
      className={screenClass(twoLevel, activeDrag, link.mode === 'none')}
      style={screenStyle(colWidth)}
    >
      <Toolbar
        boards={boards}
        board={board}
        universe={reference.universe}
        sprint={sprint}
        selectedCount={selectedIds.size}
        matchCount={quickFilter ? highlightIds.size : null}
        quickFilter={quickFilter}
        onQuickFilter={setQuickFilter}
        cardSize={view.cardSize}
        connectorsMode={view.connectorsMode}
        loading={data.loading || reference.loading}
        status={status}
        onSelectBoard={onSelectBoard}
        onNewBoard={onNewBoard}
        onOpenSettings={onOpenSettings}
        onSelectSprint={onSelectSprint}
        onOpenQuickFind={onOpenQuickFind}
        onCardSize={size => updatePrefs(prev => setBoardView(prev, board.id, {cardSize: size}))}
        onConnectorsMode={mode => updatePrefs(prev => setBoardView(prev, board.id, {connectorsMode: mode}))}
        showNewIssue={view.showNewIssue}
        onShowNewIssue={show => updatePrefs(prev => setBoardView(prev, board.id, {showNewIssue: show}))}
        starredBoards={prefs.starredBoards}
        onToggleStar={boardId => updatePrefs(prev => toggleStar(prev, boardId))}
        onRefresh={() => {
          reference.reload();
          data.refresh();
        }}
      />
      {error && <div className="board-error">{error}</div>}
      {board.columns.length === 0 && !isDynamicField(reference.universe.byName.get(board.columnField.name)?.kind ?? board.columnField.kind, board.columnOptions) && !error && (
        <div className="board-empty">This board has no columns yet. Open the board settings to configure columns.</div>
      )}
      <BoardContext.Provider value={contextValue}>
        <DndContext
          sensors={sensors}
          collisionDetection={link.collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            setDragTarget(null);
            endLinkDrag();
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
                availableColumns={layout.availableColumns}
                onPickColumns={pickColumns}
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
                mode={view.connectorsMode}
                contentRef={contentRef}
                registry={registry}
                layoutVersion={layoutVersion}
              />
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            <DragPreview active={activeDrag} hint={dragHint} cardSize={view.cardSize} board={board}/>
          </DragOverlay>
        </DndContext>
      </BoardContext.Provider>
      <PendingMoveDialogs
        pending={pendingMove}
        board={board}
        universe={reference.universe}
        issues={data.issues}
        onPickValue={onPickValue}
        onPickChoice={onPickChoice}
        onCancel={() => setPendingMove(null)}
      />
      <RelationPickerDialog {...link.dialog}/>
      {quickFindTerm !== null && (
        <QuickFind
          term={quickFindTerm}
          matchCount={matchIds.size}
          onChange={setQuickFindTerm}
          onSubmit={selectMatches}
          onClose={() => setQuickFindTerm(null)}
        />
      )}
    </div>
  );
};
