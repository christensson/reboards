import type {HostAPI} from '../../../@types/globals';

export type CardSize = 'small' | 'normal';

/** Which relation connectors are drawn. */
export type ConnectorsMode = 'none' | 'selected' | 'all';

/** View settings remembered per board. */
export type BoardView = {
  cardSize: CardSize;
  connectorsMode: ConnectorsMode;
  /** Show the "+" / "New issue…" links in cells. */
  showNewIssue: boolean;
  /** Draw subtasks in boxes of their parent (and, in the time layout, on the parent's row). */
  groupByParent: boolean;
};

export type UserPrefs = {
  lastBoardId?: string;
  /** Explicitly chosen sprint per board id; '' means "Unscheduled" (issues without a sprint). */
  lastSprintByBoard: Record<string, string>;
  /** Last used view settings, the default for boards without a stored view. */
  cardSize: CardSize;
  connectorsMode: ConnectorsMode;
  showNewIssue: boolean;
  groupByParent: boolean;
  viewByBoard: Record<string, Partial<BoardView>>;
  /** Board ids the user has starred. */
  starredBoards: string[];
  /** Collapsed row keys per board id. */
  collapsedRows: Record<string, string[]>;
  /** Collapsed column ids per board id. */
  collapsedColumns: Record<string, string[]>;
  /** Collapsed first-level swimlane keys per board id (two-level boards). */
  collapsedOuterRows: Record<string, string[]>;
  /** Boards whose two swimlane levels are shown swapped for this user. */
  swappedSwimlanes: Record<string, boolean>;
  /** Collapsed subtask group keys per board id. */
  collapsedGroups: Record<string, string[]>;
  /** Dynamic column fields: ids of the columns the user picked per board id; the board default when missing. */
  visibleColumns: Record<string, string[]>;
  /** Boards with both swimlanes and time set up: the layout the user picked per board id. */
  rowModeByBoard: Record<string, 'swimlanes' | 'time'>;
  /** Explicitly chosen page per board id; '' means "All" (field pages). */
  lastPageByBoard: Record<string, string>;
  /** Starred page keys per board id. */
  starredPagesByBoard: Record<string, string[]>;
};

export const PREFS_KEY = 'reboards.prefs.v1';

export const defaultPrefs = (): UserPrefs => ({
  lastSprintByBoard: {},
  cardSize: 'normal',
  connectorsMode: 'selected',
  showNewIssue: true,
  groupByParent: true,
  viewByBoard: {},
  starredBoards: [],
  collapsedRows: {},
  collapsedColumns: {},
  collapsedOuterRows: {},
  swappedSwimlanes: {},
  collapsedGroups: {},
  visibleColumns: {},
  rowModeByBoard: {},
  lastPageByBoard: {},
  starredPagesByBoard: {}
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps the string entries of a stored map; anything else becomes an empty map. */
const stringMap = (value: unknown): Record<string, string> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};

/** Keeps the string lists of a stored map, without their non-string items. */
const stringListMap = (value: unknown): Record<string, string[]> =>
  isRecord(value)
    ? Object.fromEntries(Object.entries(value)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([key, list]) => [key, list.filter((item): item is string => typeof item === 'string')]))
    : {};

const readRaw = async (host: HostAPI): Promise<string | null> => {
  try {
    if (host.storage) {
      return await host.storage.getItem(PREFS_KEY);
    }
    return window.localStorage.getItem(PREFS_KEY);
  } catch {
    return null;
  }
};

const writeRaw = async (host: HostAPI, value: string): Promise<void> => {
  try {
    if (host.storage) {
      await host.storage.setItem(PREFS_KEY, value);
    } else {
      window.localStorage.setItem(PREFS_KEY, value);
    }
  } catch (error) {
    console.warn('[reboards] Could not persist preferences', error);
  }
};

export const loadPrefs = async (host: HostAPI): Promise<UserPrefs> => {
  const raw = await readRaw(host);
  if (!raw) {
    return defaultPrefs();
  }
  try {
    const stored = JSON.parse(raw) as Partial<UserPrefs> & {alwaysShowConnectors?: boolean};
    const migrated: Partial<UserPrefs> = {...stored};
    if (!stored.connectorsMode && stored.alwaysShowConnectors !== undefined) {
      migrated.connectorsMode = stored.alwaysShowConnectors ? 'all' : 'selected';
    }
    // Prefs written before pages existed lack these maps; the checks also keep corrupt values out.
    return {...defaultPrefs(), ...migrated, lastPageByBoard: stringMap(stored.lastPageByBoard), starredPagesByBoard: stringListMap(stored.starredPagesByBoard)};
  } catch {
    return defaultPrefs();
  }
};

export const savePrefs = (host: HostAPI, prefs: UserPrefs): Promise<void> => writeRaw(host, JSON.stringify(prefs));

export const boardView = (prefs: UserPrefs, boardId: string): BoardView => ({
  cardSize: prefs.viewByBoard[boardId]?.cardSize ?? prefs.cardSize,
  connectorsMode: prefs.viewByBoard[boardId]?.connectorsMode ?? prefs.connectorsMode,
  showNewIssue: prefs.viewByBoard[boardId]?.showNewIssue ?? prefs.showNewIssue,
  groupByParent: prefs.viewByBoard[boardId]?.groupByParent ?? prefs.groupByParent
});

/** Stores view settings for one board and makes them the default for boards without a stored view. */
export const setBoardView = (prefs: UserPrefs, boardId: string, patch: Partial<BoardView>): Partial<UserPrefs> => ({
  ...patch,
  viewByBoard: {...prefs.viewByBoard, [boardId]: {...prefs.viewByBoard[boardId], ...patch}}
});

export const toggleStar = (prefs: UserPrefs, boardId: string): Partial<UserPrefs> => ({
  starredBoards: prefs.starredBoards.includes(boardId)
    ? prefs.starredBoards.filter(id => id !== boardId)
    : [...prefs.starredBoards, boardId]
});

/**
 * Stars or unstars a page of a board. Stars of pages the board no longer has (`keys`) are dropped
 * on the way, so the list does not grow with pages long gone.
 */
export const toggleStarredPage = (prefs: UserPrefs, boardId: string, pageKey: string, keys: string[]): Partial<UserPrefs> => {
  const current = (prefs.starredPagesByBoard[boardId] ?? []).filter(key => keys.includes(key));
  const next = current.includes(pageKey) ? current.filter(key => key !== pageKey) : [...current, pageKey];
  return {starredPagesByBoard: {...prefs.starredPagesByBoard, [boardId]: next}};
};
