/**
 * Board configuration model shared by the backend (persistence) and the widget.
 * Keep this file free of React and YouTrack API imports.
 *
 * Fields and field values are referenced by NAME, never by id: a board can span
 * several projects whose ProjectCustomField and bundle value ids differ while
 * the names are what issues expose through the REST API.
 */

/**
 * @zod-to-schema
 */
export type FieldRef = {
  name: string;
  kind: 'enum' | 'state' | 'version' | 'user' | 'integer';
};

export type FieldKind = FieldRef['kind'];

/**
 * @zod-to-schema
 */
export type ColumnConfig = {
  /** Stable id used for droppable ids and grid tracks. */
  id: string;
  /** Optional display name; defaults to the values joined with " / ". */
  name?: string;
  /** One or more field value names combined into this column. */
  values: string[];
};

/**
 * @zod-to-schema
 */
export type RowConfig = {
  /** null → the whole board is a single "Uncategorized" row. */
  field: FieldRef | null;
  sort: 'custom' | 'alphabetical' | 'alphabetical-desc' | 'numerical' | 'numerical-desc';
  /** Value names in display order; only used when sort === 'custom'. */
  customOrder: string[];
};

export type RowSortMode = RowConfig['sort'];

/**
 * @zod-to-schema
 */
export type ProjectRef = {
  id: string;
  shortName: string;
};

/**
 * @zod-to-schema
 */
export type SprintConfig = {
  enabled: boolean;
  field: FieldRef | null;
};

/**
 * @zod-to-schema
 */
export type BoardConfig = {
  id: string;
  name: string;
  /** Login of the owner, for display; it can change, so access checks use `ownerId`. */
  owner: string;
  /** Stable (Hub) id of the owner; empty for boards stored before it was recorded. */
  ownerId: string;
  /** Shared boards are visible to everyone who can read all their projects; personal boards only to the owner. */
  shared: boolean;
  projects: ProjectRef[];
  query: string;
  sprints: SprintConfig;
  columnField: FieldRef;
  columns: ColumnConfig[];
  ignoredValues: string[];
  /** First swimlane field; shown as a left column when a second field is configured. */
  row: RowConfig;
  /** Optional second swimlane field, rendered as swimlane bands inside each first-level group. */
  innerRow: RowConfig | null;
  /** Field names shown at the bottom of each card in "normal" size. */
  cardFields: string[];
  /** Issue link type names drawn as connectors. */
  linkTypes: string[];
  /** Field whose value colors determine the card color; null for plain cards. */
  cardColorField: FieldRef | null;
  createdAt: number;
  updatedAt: number;
  /** Raised by the server on every write; a save must name the version it started from. */
  version: number;
};

export const UNCATEGORIZED_ROW_KEY = '__uncategorized__';
export const DEFAULT_LINK_TYPES = ['Subtask'];
export const DEFAULT_CARD_FIELDS = ['Assignee', 'Type', 'Estimation'];

const ID_RADIX = 36;
const ID_RANDOM_LENGTH = 6;

export const generateId = (): string =>
  Date.now().toString(ID_RADIX) + Math.random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LENGTH);

export const createEmptyBoard = (owner: string): BoardConfig => ({
  id: '',
  name: '',
  owner,
  ownerId: '',
  shared: false,
  projects: [],
  query: '',
  sprints: {enabled: false, field: null},
  columnField: {name: 'State', kind: 'state'},
  columns: [],
  ignoredValues: [],
  row: {field: {name: 'Priority', kind: 'enum'}, sort: 'custom', customOrder: []},
  innerRow: null,
  cardFields: [...DEFAULT_CARD_FIELDS],
  linkTypes: [...DEFAULT_LINK_TYPES],
  cardColorField: {name: 'Type', kind: 'enum'},
  createdAt: 0,
  updatedAt: 0,
  version: 0
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const FIELD_KINDS: FieldKind[] = ['enum', 'state', 'version', 'user', 'integer'];

const fieldRef = (value: unknown): FieldRef | null => {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null;
  }
  const kind = FIELD_KINDS.includes(value.kind as FieldKind) ? (value.kind as FieldKind) : 'enum';
  return {name: value.name, kind};
};

const SORT_MODES: RowSortMode[] = ['custom', 'alphabetical', 'alphabetical-desc', 'numerical', 'numerical-desc'];

const normalizeColumns = (value: unknown): ColumnConfig[] =>
  Array.isArray(value)
    ? value
      .filter(isRecord)
      .map((c, index) => ({
        id: typeof c.id === 'string' && c.id ? c.id : `col-${index}`,
        ...(typeof c.name === 'string' && c.name ? {name: c.name} : {}),
        values: stringArray(c.values)
      }))
    : [];

const normalizeProjects = (value: unknown): ProjectRef[] =>
  Array.isArray(value)
    ? value
      .filter(isRecord)
      .filter(p => typeof p.id === 'string' && typeof p.shortName === 'string')
      .map(p => ({id: p.id as string, shortName: p.shortName as string}))
    : [];

const normalizeRow = (value: unknown, fallback: RowConfig): RowConfig => {
  const row = isRecord(value) ? value : {};
  return {
    field: 'field' in row ? fieldRef(row.field) : fallback.field,
    sort: SORT_MODES.includes(row.sort as RowSortMode) ? (row.sort as RowSortMode) : 'custom',
    customOrder: stringArray(row.customOrder)
  };
};

const normalizeSprints = (value: unknown): SprintConfig => {
  const sprints = isRecord(value) ? value : {};
  return {enabled: sprints.enabled === true, field: fieldRef(sprints.field)};
};

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * Fills defaults and drops unknown keys so stored documents written by older
 * versions, or hand-edited ones, always produce a well-formed BoardConfig.
 */
export const normalizeBoardConfig = (raw: unknown, fallbackOwner = ''): BoardConfig => {
  const input = isRecord(raw) ? raw : {};
  const base = createEmptyBoard(str(input.owner, fallbackOwner));
  return {
    ...base,
    id: str(input.id),
    name: str(input.name),
    ownerId: str(input.ownerId),
    shared: typeof input.shared === 'boolean' ? input.shared : base.shared,
    projects: normalizeProjects(input.projects),
    query: str(input.query),
    sprints: normalizeSprints(input.sprints),
    columnField: fieldRef(input.columnField) ?? base.columnField,
    columns: normalizeColumns(input.columns),
    ignoredValues: stringArray(input.ignoredValues),
    row: normalizeRow(input.row, base.row),
    innerRow: isRecord(input.innerRow) ? normalizeRow(input.innerRow, {field: null, sort: 'custom', customOrder: []}) : null,
    cardFields: 'cardFields' in input ? stringArray(input.cardFields) : base.cardFields,
    linkTypes: 'linkTypes' in input ? stringArray(input.linkTypes) : base.linkTypes,
    cardColorField: 'cardColorField' in input ? fieldRef(input.cardColorField) : base.cardColorField,
    createdAt: num(input.createdAt),
    updatedAt: num(input.updatedAt),
    version: num(input.version)
  };
};

export type ValidationIssue = {
  field: string;
  message: string;
};

/**
 * Size limits for one board. Every board shares one stored document, so the
 * limits keep a single board from bloating it for everyone.
 */
export const BOARD_LIMITS = {
  /** Length of the name, query excluded. */
  textLength: 200,
  queryLength: 2000,
  projects: 50,
  columns: 100,
  /** Values listed in columns, ignored values and each swimlane order. */
  values: 1000,
  /** Card fields and link types. */
  listItems: 50,
  /** The whole board as stored JSON, in characters. */
  serializedLength: 100_000
} as const;

const tooLong = (value: string, max: number): boolean => value.length > max;

const allTexts = (config: BoardConfig): string[] => [
  config.name,
  config.id,
  config.owner,
  config.columnField.name,
  ...config.projects.flatMap(p => [p.id, p.shortName]),
  ...config.columns.flatMap(c => [c.id, c.name ?? '', ...c.values]),
  ...config.ignoredValues,
  ...config.row.customOrder,
  ...(config.innerRow?.customOrder ?? []),
  ...config.cardFields,
  ...config.linkTypes,
  config.row.field?.name ?? '',
  config.innerRow?.field?.name ?? '',
  config.sprints.field?.name ?? '',
  config.cardColorField?.name ?? ''
];

/** Checks the size limits; problems are reported per limit, not per value. */
export const validateBoardSize = (config: BoardConfig): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const {textLength, queryLength, projects, columns, values, listItems, serializedLength} = BOARD_LIMITS;
  if (allTexts(config).some(text => tooLong(text, textLength))) {
    issues.push({field: 'size', message: `Names and values can be at most ${textLength} characters`});
  }
  if (tooLong(config.query, queryLength)) {
    issues.push({field: 'query', message: `The query can be at most ${queryLength} characters`});
  }
  if (config.projects.length > projects) {
    issues.push({field: 'projects', message: `A board can have at most ${projects} projects`});
  }
  if (config.columns.length > columns) {
    issues.push({field: 'columns', message: `A board can have at most ${columns} columns`});
  }
  const valueLists = [config.columns.flatMap(c => c.values), config.ignoredValues, config.row.customOrder, config.innerRow?.customOrder ?? []];
  if (valueLists.some(list => list.length > values)) {
    issues.push({field: 'size', message: `Columns, ignored values and swimlane orders can hold at most ${values} values each`});
  }
  if (config.cardFields.length > listItems || config.linkTypes.length > listItems) {
    issues.push({field: 'size', message: `Card fields and link types are limited to ${listItems} each`});
  }
  if (issues.length === 0 && JSON.stringify(config).length > serializedLength) {
    issues.push({field: 'size', message: 'The board configuration is too large'});
  }
  return issues;
};

/** Validates a config before saving. Returns an empty array when valid. */
export const validateBoardConfig = (config: BoardConfig): ValidationIssue[] => {
  const issues: ValidationIssue[] = [...validateBoardSize(config)];
  if (!config.name.trim()) {
    issues.push({field: 'name', message: 'Board name is required'});
  }
  if (config.projects.length === 0) {
    issues.push({field: 'projects', message: 'Select at least one project'});
  }
  if (!config.columnField.name) {
    issues.push({field: 'columnField', message: 'Select a column field'});
  }
  if (config.columns.length === 0) {
    issues.push({field: 'columns', message: 'Add at least one column'});
  }
  const seen = new Set<string>();
  config.columns.forEach((column, index) => {
    if (column.values.length === 0) {
      issues.push({field: 'columns', message: `Column ${index + 1} has no values`});
    }
    column.values.forEach(value => {
      if (seen.has(value)) {
        issues.push({field: 'columns', message: `Value "${value}" is used in more than one column`});
      }
      seen.add(value);
      if (config.ignoredValues.includes(value)) {
        issues.push({field: 'columns', message: `Value "${value}" is both in a column and ignored`});
      }
    });
  });
  if (config.sprints.enabled && !config.sprints.field) {
    issues.push({field: 'sprints', message: 'Select a sprint field or disable sprints'});
  }
  if (config.innerRow?.field) {
    if (!config.row.field) {
      issues.push({field: 'innerRow', message: 'Set the first swimlane field before the second'});
    } else if (config.innerRow.field.name === config.row.field.name) {
      issues.push({field: 'innerRow', message: 'The two swimlane fields must be different'});
    }
  }
  return issues;
};

/** The same board with its two swimlane levels exchanged; unchanged unless both are configured. */
export const swapSwimlanes = (config: BoardConfig): BoardConfig =>
  config.row.field && config.innerRow?.field ? {...config, row: config.innerRow, innerRow: config.row} : config;

/** True when both swimlane fields are configured. */
export const isTwoLevel = (config: BoardConfig): boolean => Boolean(config.row.field && config.innerRow?.field);

export const columnLabel = (column: ColumnConfig): string =>
  column.name?.trim() || column.values.join(' / ');
