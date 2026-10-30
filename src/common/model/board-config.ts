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
  kind: 'enum' | 'state' | 'version' | 'build' | 'user' | 'integer' | 'date' | 'datetime' | 'period';
};

export type FieldKind = FieldRef['kind'];

// How the values of a dynamic field (user, version, build) become columns or
// swimlanes. Their value sets change all the time, so they are taken from the
// issues on the board instead of being configured one by one. Enum and owned
// fields can opt in with `asDynamic`.
// `order` sorts by the field's own value order (enum and owned fields).
/**
 * @zod-to-schema
 */
export type DynamicOptions = {
  sort: 'alphabetical' | 'alphabetical-desc' | 'date' | 'date-desc' | 'order';
  /** Enum and owned fields only: treat the field as dynamic, like user and version fields. */
  asDynamic: boolean;
  /** Versions only: show released versions. */
  showReleased: boolean;
  /** Versions only: show archived versions. */
  showArchived: boolean;
  /** Columns only: how many columns are shown until the user picks others. */
  maxColumns: number;
};

export type DynamicSortMode = DynamicOptions['sort'];

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
  /** Sorting and filtering when the field is dynamic (user, version, build); `sort` then does not apply. */
  dynamic: DynamicOptions;
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

// An agile board whose issues and sprints the board shows. `name` is the name at the last save,
// for display; the live name is looked up by `id`.
/**
 * @zod-to-schema
 */
export type AgileSourceRef = {
  id: string;
  name: string;
};

// Time mode: rows ordered by a time field instead of swimlanes. The field is a date or
// "date and time" field (optionally made a range by a period field), a version (start to
// release date) or a build (assembly date). `dateRole` tells whether a date is a start or an
// end/due date, `position` which end of a range places the card, and `highlights` false
// ignores the meaning: no timing highlights or card icons.
/**
 * @zod-to-schema
 */
export type TimelineConfig = {
  field: FieldRef | null;
  periodField: FieldRef | null;
  dateRole: 'start' | 'end';
  position: 'start' | 'end';
  sort: 'asc' | 'desc';
  highlights: boolean;
  /** User field for the "unassigned" checks. */
  assigneeField: FieldRef | null;
};

/**
 * @zod-to-schema
 */
export type PageQuery = {
  /** Stable id; the URL and starred pages refer to it, so renaming keeps them. */
  id: string;
  name: string;
  query: string;
};

// Pages split a board into views picked in the toolbar: one per value of a field (plus "All" and,
// for fields that can be empty, "No <field>"), or named queries. Query pages replace the board
// query and cannot be combined with a linked agile board; sprints apply to every page.
/**
 * @zod-to-schema
 */
export type PagesConfig = {
  mode: 'none' | 'field' | 'queries';
  field: FieldRef | null;
  /** Field mode: value keys shown as pages, in order; empty shows every value. NO_VALUE_PAGE stands for "No <field>". */
  values: string[];
  /** Queries mode: the pages in order. */
  pages: PageQuery[];
};

export type PagesMode = PagesConfig['mode'];

/** How a board lays out its rows: by swimlane fields, by time, or as one row. */
export type RowMode = 'none' | 'swimlanes' | 'time';

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
  /** Issues (and sprints) from an existing agile board; `query` then narrows them further. */
  agileSource: AgileSourceRef | null;
  /** null: no columns, the board is one column wide and shows no column header. */
  columnField: FieldRef | null;
  /** Explicit columns of a stable column field (enum, state); empty for a dynamic one. */
  columns: ColumnConfig[];
  /** Sorting, filtering and the default column count of a dynamic column field. */
  columnOptions: DynamicOptions;
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
  /** Ids of boards this board links to; the linked boards show the link back. */
  relatedBoards: string[];
  /** Time mode; set up when `timeline.field` is set. */
  timeline: TimelineConfig;
  /** The layout used when both swimlanes and time are set up, until the user picks the other. */
  defaultRowMode: 'swimlanes' | 'time';
  /** Page selector; mode 'none' for boards without pages. */
  pages: PagesConfig;
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

/** Columns shown for a dynamic column field until the user picks others. */
export const DEFAULT_MAX_COLUMNS = 5;

/** Released versions shown, archived ones hidden, like YouTrack itself. */
export const defaultDynamicOptions = (): DynamicOptions => ({sort: 'alphabetical', asDynamic: false, showReleased: true, showArchived: false, maxColumns: DEFAULT_MAX_COLUMNS});

export const emptyTimeline = (): TimelineConfig => ({
  field: null,
  periodField: null,
  dateRole: 'end',
  position: 'end',
  sort: 'asc',
  highlights: true,
  assigneeField: {name: 'Assignee', kind: 'user'}
});

/** Page key of the "All" page of a field page selector; it is never in the URL. */
export const ALL_PAGE = '__all__';
/** Page key (and URL value) of the "No <field>" page of a field page selector. */
export const NO_VALUE_PAGE = '__none__';

/** Kinds a page field may have. Owned fields are enums. */
export const PAGE_FIELD_KINDS: FieldKind[] = ['enum', 'state', 'version', 'user', 'build'];

export const emptyPages = (): PagesConfig => ({mode: 'none', field: null, values: [], pages: []});

/** A swimlane level without a field. */
export const emptyRow = (): RowConfig => ({field: null, sort: 'custom', customOrder: [], dynamic: defaultDynamicOptions()});

export const createEmptyBoard = (owner: string): BoardConfig => ({
  id: '',
  name: '',
  owner,
  ownerId: '',
  shared: false,
  projects: [],
  query: '',
  sprints: {enabled: false, field: null},
  agileSource: null,
  columnField: {name: 'State', kind: 'state'},
  columns: [],
  columnOptions: defaultDynamicOptions(),
  ignoredValues: [],
  row: {...emptyRow(), field: {name: 'Priority', kind: 'enum'}},
  innerRow: null,
  cardFields: [...DEFAULT_CARD_FIELDS],
  linkTypes: [...DEFAULT_LINK_TYPES],
  relatedBoards: [],
  timeline: emptyTimeline(),
  defaultRowMode: 'swimlanes',
  pages: emptyPages(),
  cardColorField: {name: 'Type', kind: 'enum'},
  createdAt: 0,
  updatedAt: 0,
  version: 0
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const FIELD_KINDS: FieldKind[] = ['enum', 'state', 'version', 'build', 'user', 'integer', 'date', 'datetime', 'period'];

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

const DYNAMIC_SORT_MODES: DynamicSortMode[] = ['alphabetical', 'alphabetical-desc', 'date', 'date-desc', 'order'];

const normalizeDynamic = (value: unknown): DynamicOptions => {
  const options = isRecord(value) ? value : {};
  const base = defaultDynamicOptions();
  return {
    sort: DYNAMIC_SORT_MODES.includes(options.sort as DynamicSortMode) ? (options.sort as DynamicSortMode) : base.sort,
    asDynamic: options.asDynamic === true,
    showReleased: typeof options.showReleased === 'boolean' ? options.showReleased : base.showReleased,
    showArchived: typeof options.showArchived === 'boolean' ? options.showArchived : base.showArchived,
    maxColumns: typeof options.maxColumns === 'number' && options.maxColumns >= 1 ? Math.floor(options.maxColumns) : base.maxColumns
  };
};

const normalizeRow = (value: unknown, fallback: RowConfig): RowConfig => {
  const row = isRecord(value) ? value : {};
  return {
    field: 'field' in row ? fieldRef(row.field) : fallback.field,
    sort: SORT_MODES.includes(row.sort as RowSortMode) ? (row.sort as RowSortMode) : 'custom',
    customOrder: stringArray(row.customOrder),
    dynamic: normalizeDynamic(row.dynamic)
  };
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const normalizeTimeline = (value: unknown): TimelineConfig => {
  const input = isRecord(value) ? value : {};
  const base = emptyTimeline();
  return {
    field: fieldRef(input.field),
    periodField: fieldRef(input.periodField),
    dateRole: oneOf(input.dateRole, ['start', 'end'] as const, base.dateRole),
    position: oneOf(input.position, ['start', 'end'] as const, base.position),
    sort: oneOf(input.sort, ['asc', 'desc'] as const, base.sort),
    highlights: typeof input.highlights === 'boolean' ? input.highlights : base.highlights,
    assigneeField: 'assigneeField' in input ? fieldRef(input.assigneeField) : base.assigneeField
  };
};

const normalizeSprints = (value: unknown): SprintConfig => {
  const sprints = isRecord(value) ? value : {};
  return {enabled: sprints.enabled === true, field: fieldRef(sprints.field)};
};

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const normalizePageQueries = (value: unknown): PageQuery[] =>
  Array.isArray(value)
    ? value
      .filter(isRecord)
      .filter(p => typeof p.name === 'string' && p.name.trim())
      .map((p, index) => ({id: typeof p.id === 'string' && p.id ? p.id : `page-${index}`, name: p.name as string, query: str(p.query)}))
    : [];

/** Pages written by older versions are missing: those boards have no pages. */
const normalizePages = (value: unknown): PagesConfig => {
  const input = isRecord(value) ? value : {};
  const mode = oneOf(input.mode, ['none', 'field', 'queries'] as const, 'none');
  const field = fieldRef(input.field);
  return {
    mode: mode === 'field' && !field ? 'none' : mode,
    field,
    values: Array.from(new Set(stringArray(input.values))),
    pages: normalizePageQueries(input.pages)
  };
};
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
    agileSource: isRecord(input.agileSource) && typeof input.agileSource.id === 'string' && input.agileSource.id
      ? {id: input.agileSource.id, name: str(input.agileSource.name)}
      : null,
    columnField: 'columnField' in input ? fieldRef(input.columnField) : base.columnField,
    columns: normalizeColumns(input.columns),
    columnOptions: normalizeDynamic(input.columnOptions),
    ignoredValues: stringArray(input.ignoredValues),
    row: normalizeRow(input.row, base.row),
    innerRow: isRecord(input.innerRow) ? normalizeRow(input.innerRow, emptyRow()) : null,
    cardFields: 'cardFields' in input ? stringArray(input.cardFields) : base.cardFields,
    linkTypes: 'linkTypes' in input ? stringArray(input.linkTypes) : base.linkTypes,
    cardColorField: 'cardColorField' in input ? fieldRef(input.cardColorField) : base.cardColorField,
    relatedBoards: Array.from(new Set(stringArray(input.relatedBoards))).filter(id => id && id !== str(input.id)),
    timeline: normalizeTimeline(input.timeline),
    defaultRowMode: oneOf(input.defaultRowMode, ['swimlanes', 'time'] as const, base.defaultRowMode),
    pages: normalizePages(input.pages),
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
  serializedLength: 100_000,
  /** Upper bound of the default column count of a dynamic column field. */
  dynamicColumns: 50,
  /** Query pages, and values shown as field pages. */
  pages: 100
} as const;

const tooLong = (value: string, max: number): boolean => value.length > max;

const allTexts = (config: BoardConfig): string[] => [
  config.name,
  config.id,
  config.owner,
  ...config.projects.flatMap(p => [p.id, p.shortName]),
  ...config.columns.flatMap(c => [c.id, c.name ?? '', ...c.values]),
  ...config.ignoredValues,
  ...config.row.customOrder,
  ...(config.innerRow?.customOrder ?? []),
  ...config.cardFields,
  ...config.linkTypes,
  ...config.relatedBoards,
  config.agileSource?.name ?? '',
  config.agileSource?.id ?? '',
  ...config.pages.values,
  ...config.pages.pages.flatMap(p => [p.id, p.name]),
  ...[
    config.columnField,
    config.row.field,
    config.innerRow?.field,
    config.sprints.field,
    config.timeline.field,
    config.timeline.periodField,
    config.timeline.assigneeField,
    config.cardColorField,
    config.pages.field
  ].map(field => field?.name ?? '')
];

const validatePagesSize = ({pages, values}: PagesConfig): ValidationIssue[] => [
  ...(pages.some(page => tooLong(page.query, BOARD_LIMITS.queryLength))
    ? [{field: 'pages', message: `Page queries can be at most ${BOARD_LIMITS.queryLength} characters`}]
    : []),
  ...(pages.length > BOARD_LIMITS.pages || values.length > BOARD_LIMITS.pages
    ? [{field: 'pages', message: `A board can have at most ${BOARD_LIMITS.pages} pages`}]
    : [])
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
  issues.push(...validatePagesSize(config.pages));
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
  if (config.relatedBoards.length > listItems) {
    issues.push({field: 'relatedBoards', message: `A board can have at most ${listItems} related boards`});
  }
  if (issues.length === 0 && JSON.stringify(config).length > serializedLength) {
    issues.push({field: 'size', message: 'The board configuration is too large'});
  }
  return issues;
};

/** Fields whose values change all the time; columns and swimlanes come from the issues on the board. */
export const DYNAMIC_KINDS: FieldKind[] = ['user', 'version', 'build'];

export const isDynamicKind = (kind: FieldKind | 'other' | undefined): boolean => DYNAMIC_KINDS.includes(kind as FieldKind);

/** Enum fields (including owned fields) the board may treat as dynamic. */
export const canBeDynamic = (kind: FieldKind | 'other' | undefined): boolean => kind === 'enum';

/** Whether a column or swimlane field takes its values from the issues: dynamic kinds, and enums that opted in. */
export const isDynamicField = (kind: FieldKind | 'other' | undefined, options: DynamicOptions | undefined): boolean =>
  isDynamicKind(kind) || (canBeDynamic(kind) && Boolean(options?.asDynamic));

const validateColumns = (config: BoardConfig): ValidationIssue[] => {
  if (!config.columnField) {
    return [];
  }
  if (isDynamicField(config.columnField.kind, config.columnOptions)) {
    const max = config.columnOptions.maxColumns;
    return max >= 1 && max <= BOARD_LIMITS.dynamicColumns
      ? []
      : [{field: 'columns', message: `Show between 1 and ${BOARD_LIMITS.dynamicColumns} columns by default`}];
  }
  const issues: ValidationIssue[] = [];
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
  return issues;
};

const validateSwimlanes = (config: BoardConfig): ValidationIssue[] => {
  if (!config.innerRow?.field) {
    return [];
  }
  if (!config.row.field) {
    return [{field: 'innerRow', message: 'Set the first swimlane field before the second'}];
  }
  return config.innerRow.field.name === config.row.field.name ? [{field: 'innerRow', message: 'The two swimlane fields must be different'}] : [];
};

/** On a sprint board the sprint field selects the issues, so it cannot also be a column or swimlane field. */
/** The board's own sprint field, when it uses one: a linked agile board brings its own sprints instead. */
export const ownSprintField = (config: BoardConfig): FieldRef | null =>
  config.sprints.enabled && !config.agileSource ? config.sprints.field : null;

const validateSprints = (config: BoardConfig): ValidationIssue[] => {
  if (!config.sprints.enabled || config.agileSource) {
    return [];
  }
  const sprintField = config.sprints.field?.name;
  if (!sprintField) {
    return [{field: 'sprints', message: 'Select a sprint field or disable sprints'}];
  }
  const used = [config.columnField?.name, config.row.field?.name, config.innerRow?.field?.name];
  return used.includes(sprintField) ? [{field: 'sprints', message: `The sprint field ${sprintField} cannot also be a column or swimlane field`}] : [];
};

const validatePages = (config: BoardConfig): ValidationIssue[] => {
  const {mode, field, pages} = config.pages;
  if (mode === 'field') {
    if (!field || !PAGE_FIELD_KINDS.includes(field.kind)) {
      return [{field: 'pages', message: 'Select a page field: an enum, state, version, user or build field'}];
    }
    return ownSprintField(config)?.name === field.name ? [{field: 'pages', message: `The sprint field ${field.name} cannot also be the page field`}] : [];
  }
  if (mode !== 'queries') {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (pages.length === 0) {
    issues.push({field: 'pages', message: 'Add at least one page'});
  }
  const names = pages.map(page => page.name.trim().toLowerCase());
  if (names.some(name => !name)) {
    issues.push({field: 'pages', message: 'Every page needs a name'});
  }
  if (new Set(names).size !== names.length) {
    issues.push({field: 'pages', message: 'Page names must be unique'});
  }
  if (config.agileSource) {
    issues.push({field: 'pages', message: 'Query pages cannot be combined with a linked agile board'});
  }
  if (config.query.trim()) {
    issues.push({field: 'pages', message: 'Query pages replace the board query; clear the query'});
  }
  return issues;
};

/** Kinds a time field may have. */
export const TIME_FIELD_KINDS: FieldKind[] = ['date', 'datetime', 'version', 'build'];

/** Date and "date and time" fields: their single date can be made a range by a period field. */
export const isDateKind = (kind: FieldKind | 'other' | undefined): boolean => kind === 'date' || kind === 'datetime';

const validateTimeline = (config: BoardConfig): ValidationIssue[] => {
  const {field, periodField} = config.timeline;
  if (!field) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (!TIME_FIELD_KINDS.includes(field.kind)) {
    issues.push({field: 'timeline', message: 'The time field must be a date, version or build field'});
  }
  if (periodField && (periodField.kind !== 'period' || !isDateKind(field.kind))) {
    issues.push({field: 'timeline', message: 'A period field can only be combined with a date field'});
  }
  if (ownSprintField(config)?.name === field.name) {
    issues.push({field: 'timeline', message: `The sprint field ${field.name} cannot also be the time field`});
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
  return [...issues, ...validateColumns(config), ...validateSprints(config), ...validateSwimlanes(config), ...validateTimeline(config), ...validatePages(config)];
};

/** The row layouts a board has set up. */
export const availableRowModes = (config: BoardConfig): Exclude<RowMode, 'none'>[] => [
  ...(config.row.field ? ['swimlanes' as const] : []),
  ...(config.timeline.field ? ['time' as const] : [])
];

/** The layout to use: the user's pick when the board has it, else the board's default, else its only one. */
export const effectiveRowMode = (config: BoardConfig, preferred: RowMode | undefined): RowMode => {
  const modes = availableRowModes(config);
  if (preferred && preferred !== 'none' && modes.includes(preferred)) {
    return preferred;
  }
  if (modes.includes(config.defaultRowMode)) {
    return config.defaultRowMode;
  }
  return modes[0] ?? 'none';
};

/** The same board with its two swimlane levels exchanged; unchanged unless both are configured. */
export const swapSwimlanes = (config: BoardConfig): BoardConfig =>
  config.row.field && config.innerRow?.field ? {...config, row: config.innerRow, innerRow: config.row} : config;

/** True when both swimlane fields are configured. */
export const isTwoLevel = (config: BoardConfig): boolean => Boolean(config.row.field && config.innerRow?.field);

export const columnLabel = (column: ColumnConfig): string =>
  column.name?.trim() || column.values.join(' / ');

/** A board related to another: `out` when the link is stored on that other board, `in` when this one links to it. */
export type RelatedBoard = {board: BoardConfig; direction: 'out' | 'in'};

/**
 * Boards related to `board` either way, among `boards` (those the user can see), sorted by name.
 * Links to boards that are gone or hidden from the user are left out.
 */
export const relatedBoardsOf = (board: BoardConfig, boards: BoardConfig[]): RelatedBoard[] =>
  boards
    .filter(other => other.id !== board.id)
    .flatMap((other): RelatedBoard[] => {
      if (board.relatedBoards.includes(other.id)) {
        return [{board: other, direction: 'out'}];
      }
      return other.relatedBoards.includes(board.id) ? [{board: other, direction: 'in'}] : [];
    })
    .sort((a, b) => a.board.name.localeCompare(b.board.name, undefined, {numeric: true, sensitivity: 'base'}));
