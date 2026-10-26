import {type BoardConfig, type RowConfig, UNCATEGORIZED_ROW_KEY, columnLabel, isTwoLevel} from '@/common/model/board-config';
import type {YtColor} from '@/common/youtrack/types';
import type {FieldUniverse} from './fieldUniverse';
import {type BoardIssue, compareIssues} from './issue';
import {orderValues} from './sorting';

export type ParentInfo = {
  id: string;
  idReadable: string;
  summary: string;
  /** Total number of subtasks of the parent, when known. */
  childCount: number | null;
};

export type LayoutColumn = {
  id: string;
  label: string;
  values: string[];
  index: number;
  count: number;
};

/**
 * A box drawn around the subtasks of one parent within one row. Boxes nest:
 * a child that is itself a parent gets its own box inside this one.
 */
export type LayoutGroup = {
  key: string;
  rowKey: string;
  parentId: string;
  parentIdReadable: string;
  parentSummary: string;
  /** The parent issue is visible somewhere on the board. */
  parentOnBoard: boolean;
  /** The parent card is rendered inside this box. */
  parentInThisRow: boolean;
  parentColumnId: string | null;
  /** Row of the parent issue when it is on the board (key and display label). */
  parentRowKey: string | null;
  parentRowLabel: string | null;
  /** Direct children without their own box, per column id. */
  membersByColumn: Record<string, string[]>;
  memberIds: string[];
  /** Boxes of direct children that are parents themselves. */
  children: LayoutGroup[];
  /** 0 for a top-level box in the row, +1 per nesting level. */
  depth: number;
  /** Key of the enclosing box, or null for a top-level box. */
  parentGroupKey: string | null;
  /** Inclusive column index span covered by the box (members, nested boxes, parent card). */
  startIndex: number;
  endIndex: number;
  /** Every issue rendered inside this box (own parent card, members, nested boxes), per column id. */
  allIdsByColumn: Record<string, string[]>;
  /** Direct children rendered in this box (plain members plus nested boxes). */
  n: number;
  /** Total subtasks of the parent, when known. */
  m: number | null;
  /** Subtasks of the parent that are on the board but in other swimlanes. */
  childrenInOtherRows: number;
  /** Subtasks of the parent that are not on this board (other sprint or outside the query), when known. */
  childrenOffBoard: number | null;
  groupIndex: number;
  groupTotal: number;
};

export type LayoutRow = {
  key: string;
  /** 'picker' rows are the "Assign other swimlane…" drop targets of two-level boards. */
  kind: 'normal' | 'picker';
  label: string;
  /** "Outer / Inner" on two-level boards, else the label. */
  fullLabel: string;
  isUncategorized: boolean;
  color?: YtColor;
  avatarUrl?: string;
  /** Key of the enclosing first-level swimlane on two-level boards. */
  outerKey: string | null;
  /** Value key of the first swimlane field (null = uncategorized). */
  outerValue: string | null;
  /** Value key of the second swimlane field (null = uncategorized or not applicable). */
  innerValue: string | null;
  looseByColumn: Record<string, string[]>;
  /** Top-level boxes of the row. */
  groups: LayoutGroup[];
  issueCount: number;
};

/** First-level swimlane of a two-level board, enclosing its inner rows. */
export type LayoutOuterRow = {
  key: string;
  label: string;
  isUncategorized: boolean;
  color?: YtColor;
  avatarUrl?: string;
  /** Keys of the inner rows (including the picker row) in display order. */
  rowKeys: string[];
  issueCount: number;
};

export type Placement = {
  rowKey: string;
  columnId: string;
  /** Innermost box the issue is rendered in. */
  groupKey?: string;
};

export type BoardLayout = {
  columns: LayoutColumn[];
  /** All rows in display order (inner rows of every outer group on two-level boards). */
  rows: LayoutRow[];
  rowsByKey: Record<string, LayoutRow>;
  twoLevel: boolean;
  /** First-level swimlanes; empty on single-level boards. */
  outerRows: LayoutOuterRow[];
  placement: Record<string, Placement>;
  /** Enclosing box keys per box key, outermost first. */
  groupAncestors: Record<string, string[]>;
  hiddenIssueIds: string[];
};

export type LayoutInput = {
  issues: BoardIssue[];
  config: BoardConfig;
  universe: FieldUniverse;
  parents: Record<string, ParentInfo>;
};

export const groupKey = (parentId: string, rowKey: string): string => `${parentId}::${rowKey}`;

/** Separates the first- and second-level keys inside a composite row key. */
export const ROW_KEY_SEPARATOR = '\u0000';
/** Second-level part of the key of a picker row. */
export const PICKER_ROW_SUFFIX = '__pick__';
export const PICKER_ROW_LABEL = 'Assign other swimlane…';

export const compositeRowKey = (outerKey: string, innerKey: string): string => `${outerKey}${ROW_KEY_SEPARATOR}${innerKey}`;

const ROW_UNIVERSE_KINDS = new Set(['enum', 'state', 'version']);

const compareReadable = (a: string, b: string): number => a.localeCompare(b, undefined, {numeric: true});

type RowMeta = {key: string; label: string; ordinal?: number; color?: YtColor; avatarUrl?: string};

/** Value key of a swimlane field for an issue; Uncategorized when unset or when no field is configured. */
const rowValueKey = (issue: BoardIssue, rowConfig: RowConfig | null): string =>
  rowConfig?.field ? (issue.fields[rowConfig.field.name]?.key ?? UNCATEGORIZED_ROW_KEY) : UNCATEGORIZED_ROW_KEY;

/**
 * Swimlane values for one level: the field's bundle values (when requested) plus the
 * values observed on the given issues, ordered per the row config; Uncategorized first.
 */
const buildMetasFor = (
  rowConfig: RowConfig | null,
  universe: FieldUniverse,
  issues: BoardIssue[],
  includeUniverse: boolean,
  uncategorizedLabel: string
): RowMeta[] => {
  const field = rowConfig?.field ?? null;
  const metas = new Map<string, RowMeta>();
  let hasUncategorized = !field;
  if (field) {
    const resolved = universe.byName.get(field.name);
    if (includeUniverse && resolved && ROW_UNIVERSE_KINDS.has(resolved.kind)) {
      resolved.values.forEach(v => metas.set(v.key, {key: v.key, label: v.label, ordinal: v.ordinal, color: v.color}));
    }
    const ordinalByKey = new Map((resolved?.values ?? []).map(v => [v.key, v.ordinal]));
    issues.forEach(issue => {
      const value = issue.fields[field.name];
      if (!value) {
        hasUncategorized = true;
      } else if (!metas.has(value.key)) {
        metas.set(value.key, {key: value.key, label: value.label, ordinal: ordinalByKey.get(value.key), color: value.color, avatarUrl: value.avatarUrl});
      }
    });
  }
  const ordered = rowConfig ? orderValues(Array.from(metas.values()), rowConfig.sort, rowConfig.customOrder) : [];
  return [...(hasUncategorized ? [{key: UNCATEGORIZED_ROW_KEY, label: uncategorizedLabel}] : []), ...ordered];
};

type PlacementResult = {
  placed: Map<string, Placement>;
  placedIssues: BoardIssue[];
  hiddenIssueIds: string[];
};

const placeIssues = (issues: BoardIssue[], config: BoardConfig): PlacementResult => {
  const ignored = new Set(config.ignoredValues);
  const valueToColumn = new Map<string, string>();
  config.columns.forEach(c => c.values.forEach(v => {
    if (!ignored.has(v) && !valueToColumn.has(v)) {
      valueToColumn.set(v, c.id);
    }
  }));
  const placed = new Map<string, Placement>();
  const hiddenIssueIds: string[] = [];
  const placedIssues: BoardIssue[] = [];
  const twoLevel = isTwoLevel(config);
  [...issues].sort(compareIssues).forEach(issue => {
    const columnValue = issue.fields[config.columnField.name]?.key;
    const columnId = columnValue === undefined ? undefined : valueToColumn.get(columnValue);
    if (!columnId) {
      hiddenIssueIds.push(issue.id);
      return;
    }
    const outerKey = rowValueKey(issue, config.row);
    const rowKey = twoLevel ? compositeRowKey(outerKey, rowValueKey(issue, config.innerRow)) : outerKey;
    placed.set(issue.id, {rowKey, columnId});
    placedIssues.push(issue);
  });
  return {placed, placedIssues, hiddenIssueIds};
};

type RowSkeleton = Omit<LayoutRow, 'looseByColumn' | 'groups' | 'issueCount'>;

type RowsResult = {
  rows: RowSkeleton[];
  outerRows: LayoutOuterRow[];
};

const valueOrNull = (key: string): string | null => (key === UNCATEGORIZED_ROW_KEY ? null : key);

const singleLevelRows = (config: BoardConfig, universe: FieldUniverse, placedIssues: BoardIssue[]): RowsResult => {
  const metas = buildMetasFor(config.row, universe, placedIssues, true, config.row.field ? 'Uncategorized' : 'All issues');
  return {
    rows: metas.map(meta => ({
      key: meta.key,
      kind: 'normal',
      label: meta.label,
      fullLabel: meta.label,
      isUncategorized: meta.key === UNCATEGORIZED_ROW_KEY,
      ...(meta.color ? {color: meta.color} : {}),
      ...(meta.avatarUrl ? {avatarUrl: meta.avatarUrl} : {}),
      outerKey: null,
      outerValue: valueOrNull(meta.key),
      innerValue: null
    })),
    outerRows: []
  };
};

const twoLevelRows = (config: BoardConfig, universe: FieldUniverse, placedIssues: BoardIssue[]): RowsResult => {
  const rows: RowSkeleton[] = [];
  const outerRows: LayoutOuterRow[] = [];
  const outerMetas = buildMetasFor(config.row, universe, placedIssues, true, 'Uncategorized');
  outerMetas.forEach(outer => {
    const issuesInOuter = placedIssues.filter(issue => rowValueKey(issue, config.row) === outer.key);
    const innerMetas = buildMetasFor(config.innerRow, universe, issuesInOuter, false, 'Uncategorized');
    const rowKeys: string[] = [];
    innerMetas.forEach(inner => {
      const key = compositeRowKey(outer.key, inner.key);
      rowKeys.push(key);
      rows.push({
        key,
        kind: 'normal',
        label: inner.label,
        fullLabel: `${outer.label} / ${inner.label}`,
        isUncategorized: inner.key === UNCATEGORIZED_ROW_KEY,
        ...(inner.color ? {color: inner.color} : {}),
        ...(inner.avatarUrl ? {avatarUrl: inner.avatarUrl} : {}),
        outerKey: outer.key,
        outerValue: valueOrNull(outer.key),
        innerValue: valueOrNull(inner.key)
      });
    });
    const pickerKey = compositeRowKey(outer.key, PICKER_ROW_SUFFIX);
    rowKeys.push(pickerKey);
    rows.push({
      key: pickerKey,
      kind: 'picker',
      label: PICKER_ROW_LABEL,
      fullLabel: `${outer.label} / …`,
      isUncategorized: false,
      outerKey: outer.key,
      outerValue: valueOrNull(outer.key),
      innerValue: null
    });
    outerRows.push({
      key: outer.key,
      label: outer.label,
      isUncategorized: outer.key === UNCATEGORIZED_ROW_KEY,
      ...(outer.color ? {color: outer.color} : {}),
      ...(outer.avatarUrl ? {avatarUrl: outer.avatarUrl} : {}),
      rowKeys,
      issueCount: issuesInOuter.length
    });
  });
  return {rows, outerRows};
};

/* ---------- Subtask groups ---------- */

const chooseParent = (issue: BoardIssue, placed: Map<string, Placement>, issuesById: Map<string, BoardIssue>): string | null => {
  if (issue.parentIds.length === 0) {
    return null;
  }
  const readable = (id: string): string => issuesById.get(id)?.idReadable ?? `~${id}`;
  const byReadable = (a: string, b: string): number => compareReadable(readable(a), readable(b));
  const onBoard = issue.parentIds.filter(id => placed.has(id)).sort(byReadable);
  return onBoard.length > 0 ? onBoard[0] : [...issue.parentIds].sort(byReadable)[0];
};

type GroupDraft = {
  key: string;
  parentId: string;
  rowKey: string;
  /** All direct children placed in this row (plain members and nested parents). */
  memberIds: string[];
  parentKey: string | null;
};

type GroupBuildContext = {
  placed: Map<string, Placement>;
  issuesById: Map<string, BoardIssue>;
  parents: Record<string, ParentInfo>;
  columnIndex: Map<string, number>;
  rowOrder: Map<string, number>;
  rowLabels: Map<string, string>;
  drafts: Map<string, GroupDraft>;
  rowsPerParent: Map<string, string[]>;
  /** Children placed on the board (any swimlane) per parent id. */
  onBoardChildren: Map<string, number>;
  ancestors: Record<string, string[]>;
};

const buildGroupDrafts = (placedIssues: BoardIssue[], placed: Map<string, Placement>, issuesById: Map<string, BoardIssue>): Map<string, GroupDraft> => {
  const drafts = new Map<string, GroupDraft>();
  const chosenParent = new Map<string, string>();
  placedIssues.forEach(issue => {
    const parentId = chooseParent(issue, placed, issuesById);
    if (!parentId) {
      return;
    }
    chosenParent.set(issue.id, parentId);
    const rowKey = placed.get(issue.id)?.rowKey ?? UNCATEGORIZED_ROW_KEY;
    const key = groupKey(parentId, rowKey);
    const draft = drafts.get(key) ?? {key, parentId, rowKey, memberIds: [], parentKey: null};
    draft.memberIds.push(issue.id);
    drafts.set(key, draft);
  });
  // A box nests inside the box of its parent's parent when that parent is rendered in the same row.
  drafts.forEach(draft => {
    const grandParentId = chosenParent.get(draft.parentId);
    const parentPlacement = placed.get(draft.parentId);
    if (grandParentId && parentPlacement && parentPlacement.rowKey === draft.rowKey) {
      const outer = groupKey(grandParentId, draft.rowKey);
      if (outer !== draft.key && drafts.has(outer)) {
        draft.parentKey = outer;
      }
    }
  });
  // Guard against cycles in the link data: cut the chain where a box would contain itself.
  drafts.forEach(draft => {
    const seen = new Set<string>([draft.key]);
    let current = draft.parentKey;
    while (current) {
      if (seen.has(current)) {
        draft.parentKey = null;
        break;
      }
      seen.add(current);
      current = drafts.get(current)?.parentKey ?? null;
    }
  });
  return drafts;
};

const compareIds = (issuesById: Map<string, BoardIssue>) => (a: string, b: string): number => {
  const ia = issuesById.get(a);
  const ib = issuesById.get(b);
  return ia && ib ? compareIssues(ia, ib) : a.localeCompare(b);
};

const assignGroupKey = (placed: Map<string, Placement>, id: string, key: string): void => {
  const p = placed.get(id);
  if (p) {
    placed.set(id, {...p, groupKey: key});
  }
};

const parentDetails = (parentId: string, ctx: GroupBuildContext): Pick<LayoutGroup, 'parentIdReadable' | 'parentSummary' | 'm'> => {
  const parentIssue = ctx.issuesById.get(parentId);
  const parentInfo = ctx.parents[parentId];
  return {
    parentIdReadable: parentIssue?.idReadable ?? parentInfo?.idReadable ?? parentId,
    parentSummary: parentIssue?.summary ?? parentInfo?.summary ?? '',
    m: parentIssue ? parentIssue.childIds.length : (parentInfo?.childCount ?? null)
  };
};

const addIds = (byColumn: Record<string, string[]>, columnId: string, ids: string[]): void => {
  (byColumn[columnId] ??= []).push(...ids);
};

const buildGroup = (draft: GroupDraft, depth: number, ancestors: string[], ctx: GroupBuildContext): LayoutGroup => {
  const {placed, columnIndex} = ctx;
  ctx.ancestors[draft.key] = ancestors;
  const sortedMembers = [...draft.memberIds].sort(compareIds(ctx.issuesById));
  const nestedKeys = sortedMembers.map(id => groupKey(id, draft.rowKey)).filter(key => ctx.drafts.get(key)?.parentKey === draft.key);
  const nestedParentIds = new Set(nestedKeys.map(key => ctx.drafts.get(key)?.parentId));
  const memberIds = sortedMembers.filter(id => !nestedParentIds.has(id));
  memberIds.forEach(id => assignGroupKey(placed, id, draft.key));

  const parentPlacement = placed.get(draft.parentId);
  const parentInThisRow = parentPlacement?.rowKey === draft.rowKey;
  if (parentInThisRow) {
    assignGroupKey(placed, draft.parentId, draft.key);
  }

  const children = nestedKeys
    .map(key => ctx.drafts.get(key))
    .filter((d): d is GroupDraft => Boolean(d))
    .map(child => buildGroup(child, depth + 1, [...ancestors, draft.key], ctx));

  const membersByColumn: Record<string, string[]> = {};
  const allIdsByColumn: Record<string, string[]> = {};
  const indices: number[] = [];
  if (parentInThisRow && parentPlacement) {
    indices.push(columnIndex.get(parentPlacement.columnId) ?? 0);
    addIds(allIdsByColumn, parentPlacement.columnId, [draft.parentId]);
  }
  memberIds.forEach(id => {
    const columnId = placed.get(id)?.columnId;
    if (columnId) {
      (membersByColumn[columnId] ??= []).push(id);
      addIds(allIdsByColumn, columnId, [id]);
      indices.push(columnIndex.get(columnId) ?? 0);
    }
  });
  children.forEach(child => {
    indices.push(child.startIndex, child.endIndex);
    Object.entries(child.allIdsByColumn).forEach(([columnId, ids]) => addIds(allIdsByColumn, columnId, ids));
  });

  const rows = ctx.rowsPerParent.get(draft.parentId) ?? [draft.rowKey];
  const details = parentDetails(draft.parentId, ctx);
  const onBoard = ctx.onBoardChildren.get(draft.parentId) ?? draft.memberIds.length;
  return {
    key: draft.key,
    rowKey: draft.rowKey,
    parentId: draft.parentId,
    ...details,
    childrenInOtherRows: onBoard - draft.memberIds.length,
    childrenOffBoard: details.m === null ? null : Math.max(0, details.m - onBoard),
    parentOnBoard: placed.has(draft.parentId),
    parentInThisRow,
    parentColumnId: parentPlacement?.columnId ?? null,
    parentRowKey: parentPlacement?.rowKey ?? null,
    parentRowLabel: parentPlacement ? (ctx.rowLabels.get(parentPlacement.rowKey) ?? null) : null,
    membersByColumn,
    memberIds,
    children,
    depth,
    parentGroupKey: draft.parentKey,
    startIndex: Math.min(...indices),
    endIndex: Math.max(...indices),
    allIdsByColumn,
    n: memberIds.length + children.length,
    groupIndex: rows.indexOf(draft.rowKey) + 1,
    groupTotal: rows.length
  };
};

const buildGroups = (placedIssues: BoardIssue[], ctx: Omit<GroupBuildContext, 'drafts' | 'rowsPerParent' | 'ancestors' | 'onBoardChildren'>): {
  groupsByRow: Map<string, LayoutGroup[]>;
  ancestors: Record<string, string[]>;
} => {
  const drafts = buildGroupDrafts(placedIssues, ctx.placed, ctx.issuesById);
  const rowsPerParent = new Map<string, string[]>();
  drafts.forEach(draft => {
    const rows = rowsPerParent.get(draft.parentId) ?? [];
    rows.push(draft.rowKey);
    rowsPerParent.set(draft.parentId, rows);
  });
  rowsPerParent.forEach(rows => rows.sort((a, b) => (ctx.rowOrder.get(a) ?? 0) - (ctx.rowOrder.get(b) ?? 0)));
  const onBoardChildren = new Map<string, number>();
  drafts.forEach(draft => onBoardChildren.set(draft.parentId, (onBoardChildren.get(draft.parentId) ?? 0) + draft.memberIds.length));
  const fullCtx: GroupBuildContext = {...ctx, drafts, rowsPerParent, ancestors: {}, onBoardChildren};
  const groupsByRow = new Map<string, LayoutGroup[]>();
  drafts.forEach(draft => {
    if (draft.parentKey !== null) {
      return;
    }
    const group = buildGroup(draft, 0, [], fullCtx);
    const list = groupsByRow.get(draft.rowKey) ?? [];
    list.push(group);
    groupsByRow.set(draft.rowKey, list);
  });
  groupsByRow.forEach(list => list.sort((a, b) => compareReadable(a.parentIdReadable, b.parentIdReadable)));
  return {groupsByRow, ancestors: fullCtx.ancestors};
};

/* ---------- Layout ---------- */

export const computeLayout = ({issues, config, universe, parents}: LayoutInput): BoardLayout => {
  const columns: LayoutColumn[] = config.columns.map((c, index) => ({
    id: c.id,
    label: columnLabel(c),
    values: c.values,
    index,
    count: 0
  }));
  const columnIndex = new Map(columns.map(c => [c.id, c.index]));
  const issuesById = new Map(issues.map(i => [i.id, i]));
  const {placed, placedIssues, hiddenIssueIds} = placeIssues(issues, config);
  const twoLevel = isTwoLevel(config);
  const skeleton = twoLevel ? twoLevelRows(config, universe, placedIssues) : singleLevelRows(config, universe, placedIssues);
  const rowOrder = new Map(skeleton.rows.map((r, index) => [r.key, index]));
  const rowLabels = new Map(skeleton.rows.map(r => [r.key, r.fullLabel]));
  const {groupsByRow, ancestors} = buildGroups(placedIssues, {placed, issuesById, parents, columnIndex, rowOrder, rowLabels});

  const rows: LayoutRow[] = skeleton.rows.map(row => ({
    ...row,
    looseByColumn: Object.fromEntries(columns.map(c => [c.id, [] as string[]])),
    groups: groupsByRow.get(row.key) ?? [],
    issueCount: 0
  }));
  const rowByKey = new Map(rows.map(r => [r.key, r]));
  const columnById = new Map(columns.map(c => [c.id, c]));

  placedIssues.forEach(issue => {
    const p = placed.get(issue.id);
    const row = p && rowByKey.get(p.rowKey);
    const column = p && columnById.get(p.columnId);
    if (!p || !row || !column) {
      return;
    }
    row.issueCount += 1;
    column.count += 1;
    if (!p.groupKey) {
      row.looseByColumn[p.columnId].push(issue.id);
    }
  });

  return {
    columns,
    rows,
    rowsByKey: Object.fromEntries(rowByKey),
    twoLevel,
    outerRows: skeleton.outerRows,
    placement: Object.fromEntries(placed),
    groupAncestors: ancestors,
    hiddenIssueIds
  };
};

/**
 * Packs top-level boxes of a swimlane into horizontal bands: boxes whose column spans
 * do not overlap share a band (side by side); overlapping boxes go to later bands.
 */
export const packGroups = (groups: LayoutGroup[]): LayoutGroup[][] => {
  const bands: {groups: LayoutGroup[]; spans: [number, number][]}[] = [];
  const ordered = [...groups].sort((a, b) => a.startIndex - b.startIndex || compareReadable(a.parentIdReadable, b.parentIdReadable));
  ordered.forEach(group => {
    const free = bands.find(band => band.spans.every(([start, end]) => group.endIndex < start || group.startIndex > end));
    if (free) {
      free.groups.push(group);
      free.spans.push([group.startIndex, group.endIndex]);
    } else {
      bands.push({groups: [group], spans: [[group.startIndex, group.endIndex]]});
    }
  });
  return bands.map(band => band.groups);
};

/** Visits a box and all boxes nested in it. */
export const walkGroups = (groups: LayoutGroup[], visit: (group: LayoutGroup) => void): void => {
  groups.forEach(group => {
    visit(group);
    walkGroups(group.children, visit);
  });
};
