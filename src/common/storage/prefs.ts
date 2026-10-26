import type {HostAPI} from '../../../@types/globals';

export type CardSize = 'small' | 'normal';

/** Which relation connectors are drawn. */
export type ConnectorsMode = 'none' | 'selected' | 'all';

export type UserPrefs = {
  lastBoardId?: string;
  lastSprintByBoard: Record<string, string>;
  cardSize: CardSize;
  connectorsMode: ConnectorsMode;
  /** Collapsed row keys per board id. */
  collapsedRows: Record<string, string[]>;
  /** Collapsed column ids per board id. */
  collapsedColumns: Record<string, string[]>;
  /** Collapsed subtask group keys per board id. */
  collapsedGroups: Record<string, string[]>;
};

export const PREFS_KEY = 'sprinter.prefs.v1';

export const defaultPrefs = (): UserPrefs => ({
  lastSprintByBoard: {},
  cardSize: 'normal',
  connectorsMode: 'selected',
  collapsedRows: {},
  collapsedColumns: {},
  collapsedGroups: {}
});

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
    console.warn('[sprinter] Could not persist preferences', error);
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
    return {...defaultPrefs(), ...migrated};
  } catch {
    return defaultPrefs();
  }
};

export const savePrefs = (host: HostAPI, prefs: UserPrefs): Promise<void> => writeRaw(host, JSON.stringify(prefs));
