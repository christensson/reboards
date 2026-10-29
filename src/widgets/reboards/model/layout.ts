import {type BoardConfig, type RowConfig, UNCATEGORIZED_ROW_KEY, columnLabel, isDynamicField, isTwoLevel} from '@/common/model/board-config';
import type {YtColor} from '@/common/youtrack/types';
import {dynamicValues, noValueLabel, shownKeys} from './dynamicValues';
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
  /** Dynamic column fields: the column's value key, or null for the "No <field>" column; undefined for configured columns. */
  columnKey?: string | null;
  /** The rightmost "Assign <field>…" column of a dynamic field: a drop target that asks for the value. */
  assign?: boolean;
};

/** A column a dynamic column field could show, for the column picker. */
export type AvailableColumn = {
  id: string;
  /** Value key, or null for the "No <field>" column. */
  key: string | null;
  label: string;
  color?: YtColor;
  /** Issues carrying the value. */
  count: number;
  visible: boolean;
};

/** Id of the column of issues without a value of a dynamic column field. */
export const NO_VALUE_COLUMN_ID = '__none__';

export const dynamicColumnId = (key: string): string => `v:${key}`;

/** Id of the "Assign <field>…" column, which sets a value no issue on the board has yet. */
export const ASSIGN_COLUMN_ID = '__assign__';

export const assignColumnLabel = (fieldName: string): string => `Assign ${fieldName}…`;

/**
 * Column ids to show so that the columns of values just assigned to the dynamic column field
 * are visible: the shown columns plus those. No values means the "No <field>" column. Null
 * when they are shown already or the columns are configured ones.
 */
export const revealColumnIds = (columns: LayoutColumn[], valueKeys: string[]): string[] | null => {
  if (!columns.some(c => c.assign)) {
    return null;
  }
  const shown = columns.filter(c => !c.assign).map(c => c.id);
  const wanted = valueKeys.length > 0 ? valueKeys.map(dynamicColumnId) : [NO_VALUE_COLUMN_ID];
  const missing = wanted.filter(id => !shown.includes(id));
  return missing.length > 0 ? [...shown, ...missing] : null;
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
  /** 'picker' rows are the "Assign <field>…" drop targets of two-level boards. */
  kind: 'normal' | 'picker';
  /** Picker rows: the swimlane level whose value is asked for on drop. */
  pickLevel?: 'outer' | 'inner';
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
  /** The last first-level swimlane of a dynamic field: it only holds an "Assign <field>…" row. */
  isPicker?: boolean;
};

export type Placement = {
  rowKey: string;
  columnId: string;
  /** Innermost box the issue is rendered in. */
  groupKey?: string;
};

/**
 * One rendered card. An issue with several values of a multi-value column or
 * swimlane field gets a card per value; the first is its primary card, whose
 * id is the issue id, and the others get ids from `cardId`.
 */
export type CardPlacement = {
  issueId: string;
  rowKey: string;
  columnId: string;
};

export const cardId = (issueId: string, columnId: string, rowKey: string): string => `${issueId}@${columnId}@${rowKey}`;

export type BoardLayout = {
  columns: LayoutColumn[];
  /** All rows in display order (inner rows of every outer group on two-level boards). */
  rows: LayoutRow[];
  rowsByKey: Record<string, LayoutRow>;
  twoLevel: boolean;
  /** No swimlane field: one "All issues" row, shown without a header. */
  noSwimlanes: boolean;
  /** First-level swimlanes; empty on single-level boards. */
  outerRows: LayoutOuterRow[];
  placement: Record<string, Placement>;
  /** Enclosing box keys per box key, outermost first. */
  groupAncestors: Record<string, string[]>;
  hiddenIssueIds: string[];
  /** Every column a dynamic column field could show, in sort order; empty for configured columns. */
  availableColumns: AvailableColumn[];
  /** Every rendered card by card id: primary cards (id = issue id) and the extra cards of multi-value fields. */
  cards: Record<string, CardPlacement>;
  /** Issues with several cards: their card ids in display order (swimlane, then column). */
  copiesByIssue: Record<string, string[]>;
};

export type LayoutInput = {
  issues: BoardIssue[];
  config: BoardConfig;
  universe: FieldUniverse;
  parents: Record<string, ParentInfo>;
  /** Dynamic column fields: ids of the columns the user picked; the first `maxColumns` when missing. */
  visibleColumnIds?: string[];
};

export const groupKey = (parentId: string, rowKey: string): string => `${parentId}::${rowKey}`;

/** Separates the first- and second-level keys inside a composite row key. */
export const ROW_KEY_SEPARATOR = '\u0000';
/** Second-level part of the key of a picker row. */
export const PICKER_ROW_SUFFIX = '__pick__';

export const compositeRowKey = (outerKey: string, innerKey: string): string => `${outerKey}${ROW_KEY_SEPARATOR}${innerKey}`;

// Stable fields list every value of the field as a swimlane; dynamic ones only those the issues carry.
const ROW_UNIVERSE_KINDS = new Set(['enum', 'state']);

const compareReadable = (a: string, b: string): number => a.localeCompare(b, undefined, {numeric: true});

type RowMeta = {key: string; label: string; ordinal?: number; color?: YtColor; avatarUrl?: string};

const isDynamicRow = (rowConfig: RowConfig | null, universe: FieldUniverse): boolean =>
  Boolean(rowConfig?.field && isDynamicField(universe.byName.get(rowConfig.field.name)?.kind ?? rowConfig.field.kind, rowConfig.dynamic));

/**
 * Value keys of a swimlane field for an issue: several for a multi-value dynamic field; Uncategorized
 * when unset or when no field is configured. Dynamic fields skip filtered-out versions, so an issue
 * with only those lands in "No <field>".
 */
const rowValueKeys = (issue: BoardIssue, rowConfig: RowConfig | null, universe: FieldUniverse): string[] => {
  const field = rowConfig?.field;
  if (!field) {
    return [UNCATEGORIZED_ROW_KEY];
  }
  if (rowConfig && isDynamicRow(rowConfig, universe)) {
    const keys = shownKeys(issue, field.name, universe.byName.get(field.name), rowConfig.dynamic);
    return keys.length > 0 ? keys : [UNCATEGORIZED_ROW_KEY];
  }
  return [issue.fields[field.name]?.key ?? UNCATEGORIZED_ROW_KEY];
};

/** Row keys of every swimlane an issue belongs in (combinations of both levels on two-level boards). */
const rowKeysOf = (issue: BoardIssue, config: BoardConfig, universe: FieldUniverse): string[] => {
  const outer = rowValueKeys(issue, config.row, universe);
  if (!isTwoLevel(config)) {
    return outer;
  }
  const inner = rowValueKeys(issue, config.innerRow, universe);
  return outer.flatMap(outerKey => inner.map(innerKey => compositeRowKey(outerKey, innerKey)));
};

/** Swimlanes of a dynamic field: the values the issues carry, sorted and filtered; "No <field>" first. */
const dynamicMetas = (rowConfig: RowConfig, universe: FieldUniverse, issues: BoardIssue[]): RowMeta[] => {
  const name = rowConfig.field?.name ?? '';
  const {values, emptyCount} = dynamicValues(name, universe.byName.get(name), issues, rowConfig.dynamic);
  return [
    ...(emptyCount > 0 ? [{key: UNCATEGORIZED_ROW_KEY, label: noValueLabel(name)}] : []),
    ...values.map(v => ({key: v.key, label: v.label, ...(v.color ? {color: v.color} : {}), ...(v.avatarUrl ? {avatarUrl: v.avatarUrl} : {})}))
  ];
};

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
  if (rowConfig && isDynamicRow(rowConfig, universe)) {
    return dynamicMetas(rowConfig, universe, issues);
  }
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
  /** Primary card of every placed issue. */
  placed: Map<string, Placement>;
  placedIssues: BoardIssue[];
  hiddenIssueIds: string[];
  /** Further cards of issues with several values of a multi-value field, by card id. */
  extraCards: Map<string, CardPlacement>;
};

/** The columns to render and, per issue, the ids of the columns it belongs in. */
type ColumnPlan = {
  columns: LayoutColumn[];
  availableColumns: AvailableColumn[];
  columnIdsOf: (issue: BoardIssue) => string[];
};

/** Configured columns of a stable field (enum, state): one column per group of values. */
const configuredColumns = (config: BoardConfig): ColumnPlan => {
  const ignored = new Set(config.ignoredValues);
  const valueToColumn = new Map<string, string>();
  config.columns.forEach(c => c.values.forEach(v => {
    if (!ignored.has(v) && !valueToColumn.has(v)) {
      valueToColumn.set(v, c.id);
    }
  }));
  const columns = config.columns.map((c, index) => ({id: c.id, label: columnLabel(c), values: c.values, index, count: 0}));
  return {
    columns,
    availableColumns: [],
    columnIdsOf: issue => {
      const key = issue.fields[config.columnField.name]?.key;
      const id = key === undefined ? undefined : valueToColumn.get(key);
      return id ? [id] : [];
    }
  };
};

/**
 * Columns of a dynamic field (user, version, build): one per value the issues
 * carry, "No <field>" first. The user's pick decides which are shown; without
 * one, the first `maxColumns` in sort order.
 */
const dynamicColumns = (config: BoardConfig, universe: FieldUniverse, issues: BoardIssue[], visibleColumnIds?: string[]): ColumnPlan => {
  const name = config.columnField.name;
  const field = universe.byName.get(name);
  const {values, emptyCount} = dynamicValues(name, field, issues, config.columnOptions);
  const all: Omit<AvailableColumn, 'visible'>[] = [
    ...(emptyCount > 0 ? [{id: NO_VALUE_COLUMN_ID, key: null, label: noValueLabel(name), count: emptyCount}] : []),
    ...values.map(v => ({id: dynamicColumnId(v.key), key: v.key, label: v.label, count: v.count, ...(v.color ? {color: v.color} : {})}))
  ];
  const picked = visibleColumnIds ? all.filter(c => visibleColumnIds.includes(c.id)) : [];
  // A pick whose columns all disappeared falls back to the default, so the board never goes blank.
  const shown = picked.length > 0 ? picked : all.slice(0, config.columnOptions.maxColumns);
  const shownIds = new Set(shown.map(c => c.id));
  const assign: LayoutColumn = {id: ASSIGN_COLUMN_ID, label: assignColumnLabel(name), values: [], index: shown.length, count: 0, assign: true};
  return {
    columns: [...shown.map((c, index) => ({id: c.id, label: c.label, values: c.key === null ? [] : [c.key], index, count: 0, columnKey: c.key})), assign],
    availableColumns: all.map(c => ({...c, visible: shownIds.has(c.id)})),
    columnIdsOf: issue => {
      const keys = shownKeys(issue, name, field, config.columnOptions);
      const ids = keys.length > 0 ? keys.map(dynamicColumnId) : [NO_VALUE_COLUMN_ID];
      return ids.filter(id => shownIds.has(id));
    }
  };
};

const planColumns = (config: BoardConfig, universe: FieldUniverse, issues: BoardIssue[], visibleColumnIds?: string[]): ColumnPlan =>
  isDynamicField(universe.byName.get(config.columnField.name)?.kind ?? config.columnField.kind, config.columnOptions)
    ? dynamicColumns(config, universe, issues, visibleColumnIds)
    : configuredColumns(config);

/** Places every issue in each of its column × swimlane combinations; issues without any are hidden. */
const placeIssues = (issues: BoardIssue[], config: BoardConfig, universe: FieldUniverse, columnIdsOf: ColumnPlan['columnIdsOf']): PlacementResult => {
  const placed = new Map<string, Placement>();
  const extraCards = new Map<string, CardPlacement>();
  const hiddenIssueIds: string[] = [];
  const placedIssues: BoardIssue[] = [];
  [...issues].sort(compareIssues).forEach(issue => {
    const rowKeys = rowKeysOf(issue, config, universe);
    const spots = columnIdsOf(issue).flatMap(columnId => rowKeys.map(rowKey => ({columnId, rowKey})));
    if (spots.length === 0) {
      hiddenIssueIds.push(issue.id);
      return;
    }
    const [primary, ...others] = spots;
    placed.set(issue.id, primary);
    others.forEach(spot => extraCards.set(cardId(issue.id, spot.columnId, spot.rowKey), {issueId: issue.id, ...spot}));
    placedIssues.push(issue);
  });
  return {placed, placedIssues, hiddenIssueIds, extraCards};
};

type RowSkeleton = Omit<LayoutRow, 'looseByColumn' | 'groups' | 'issueCount'>;

type RowsResult = {
  rows: RowSkeleton[];
  outerRows: LayoutOuterRow[];
};

const valueOrNull = (key: string): string | null => (key === UNCATEGORIZED_ROW_KEY ? null : key);

/** "Assign <field>…" row: a drop target that asks for the swimlane value. */
const pickerRow = (key: string, outerKey: string | null, outerValue: string | null, label: string, fullLabel: string, pickLevel: 'outer' | 'inner'): RowSkeleton => ({
  key,
  kind: 'picker',
  pickLevel,
  label,
  fullLabel,
  isUncategorized: false,
  outerKey,
  outerValue,
  innerValue: null
});

const singleLevelRows = (config: BoardConfig, universe: FieldUniverse, placedIssues: BoardIssue[]): RowsResult => {
  const metas = buildMetasFor(config.row, universe, placedIssues, true, config.row.field ? 'Uncategorized' : 'All issues');
  // Dynamic swimlanes only list values on the board; the picker row sets any other value.
  const label = assignColumnLabel(config.row.field?.name ?? '');
  const picker = isDynamicRow(config.row, universe) ? [pickerRow(PICKER_ROW_SUFFIX, null, null, label, label, 'outer')] : [];
  return {
    rows: [...metas.map((meta): RowSkeleton => ({
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
    })), ...picker],
    outerRows: []
  };
};

const twoLevelRows = (config: BoardConfig, universe: FieldUniverse, placedIssues: BoardIssue[]): RowsResult => {
  const rows: RowSkeleton[] = [];
  const outerRows: LayoutOuterRow[] = [];
  const outerMetas = buildMetasFor(config.row, universe, placedIssues, true, 'Uncategorized');
  const innerLabel = assignColumnLabel(config.innerRow?.field?.name ?? '');
  outerMetas.forEach(outer => {
    const issuesInOuter = placedIssues.filter(issue => rowValueKeys(issue, config.row, universe).includes(outer.key));
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
    rows.push(pickerRow(pickerKey, outer.key, valueOrNull(outer.key), innerLabel, `${outer.label} / …`, 'inner'));
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
  if (isDynamicRow(config.row, universe)) {
    // Dynamic first-level swimlanes only list values on the board; this one sets any other value.
    const pickerKey = compositeRowKey(PICKER_ROW_SUFFIX, PICKER_ROW_SUFFIX);
    const label = assignColumnLabel(config.row.field?.name ?? '');
    rows.push(pickerRow(pickerKey, PICKER_ROW_SUFFIX, null, label, label, 'outer'));
    outerRows.push({key: PICKER_ROW_SUFFIX, label, isUncategorized: false, rowKeys: [pickerKey], issueCount: 0, isPicker: true});
  }
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

/** Card ids per issue with more than one card, in display order. */
const copiesOf = (cards: Record<string, CardPlacement>, rowOrder: Map<string, number>, columnIndex: Map<string, number>): Record<string, string[]> => {
  const byIssue = new Map<string, string[]>();
  Object.entries(cards).forEach(([id, card]) => byIssue.set(card.issueId, [...(byIssue.get(card.issueId) ?? []), id]));
  const position = (id: string): [number, number] => [rowOrder.get(cards[id].rowKey) ?? 0, columnIndex.get(cards[id].columnId) ?? 0];
  const copies: Record<string, string[]> = {};
  byIssue.forEach((ids, issueId) => {
    if (ids.length > 1) {
      copies[issueId] = ids.sort((a, b) => {
        const [rowA, columnA] = position(a);
        const [rowB, columnB] = position(b);
        return rowA - rowB || columnA - columnB;
      });
    }
  });
  return copies;
};

/** Where a card is, for tooltips: "Column" or "Column · Swimlane" when the board has swimlanes. */
export const cardLocation = (layout: BoardLayout, id: string): string => {
  const card = layout.cards[id];
  if (!card) {
    return '';
  }
  const column = layout.columns.find(c => c.id === card.columnId)?.label ?? card.columnId;
  const row = layout.rowsByKey[card.rowKey];
  const hasSwimlanes = layout.twoLevel || layout.rows.length > 1;
  return row && hasSwimlanes ? `${column} · ${row.fullLabel}` : column;
};

export const computeLayout = ({issues, config, universe, parents, visibleColumnIds}: LayoutInput): BoardLayout => {
  const {columns, availableColumns, columnIdsOf} = planColumns(config, universe, issues, visibleColumnIds);
  const columnIndex = new Map(columns.map(c => [c.id, c.index]));
  const issuesById = new Map(issues.map(i => [i.id, i]));
  const {placed, placedIssues, hiddenIssueIds, extraCards} = placeIssues(issues, config, universe, columnIdsOf);
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

  // Extra cards of multi-value fields are plain cards: subtask boxes hold primary cards only.
  const cards: Record<string, CardPlacement> = {};
  placed.forEach((p, issueId) => {
    cards[issueId] = {issueId, rowKey: p.rowKey, columnId: p.columnId};
  });
  extraCards.forEach((card, id) => {
    const row = rowByKey.get(card.rowKey);
    const column = columnById.get(card.columnId);
    if (!row || !column) {
      return;
    }
    cards[id] = card;
    row.issueCount += 1;
    column.count += 1;
    row.looseByColumn[card.columnId].push(id);
  });
  if (extraCards.size > 0) {
    const byIssue = (a: string, b: string): number => compareIds(issuesById)(cards[a]?.issueId ?? a, cards[b]?.issueId ?? b);
    rows.forEach(row => Object.values(row.looseByColumn).forEach(ids => ids.sort(byIssue)));
  }

  return {
    columns,
    rows,
    copiesByIssue: copiesOf(cards, rowOrder, columnIndex),
    rowsByKey: Object.fromEntries(rowByKey),
    twoLevel,
    noSwimlanes: !config.row.field,
    outerRows: skeleton.outerRows,
    placement: Object.fromEntries(placed),
    groupAncestors: ancestors,
    hiddenIssueIds,
    availableColumns,
    cards
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
