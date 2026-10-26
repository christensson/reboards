import {useCallback, useEffect, useRef, useState} from 'react';
import {type UserPrefs, defaultPrefs, loadPrefs, savePrefs} from '@/common/storage/prefs';
import {host} from '@/common/youtrack/host';

export const usePrefs = () => {
  const [prefs, setPrefs] = useState<UserPrefs>(defaultPrefs);
  const [ready, setReady] = useState(false);
  const latest = useRef(prefs);
  latest.current = prefs;

  useEffect(() => {
    loadPrefs(host).then(loaded => {
      setPrefs(loaded);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<UserPrefs> | ((prev: UserPrefs) => Partial<UserPrefs>)) => {
    const next = {...latest.current, ...(typeof patch === 'function' ? patch(latest.current) : patch)};
    latest.current = next;
    setPrefs(next);
    savePrefs(host, next);
  }, []);

  return {prefs, ready, update};
};

const toggleInList = (list: string[], key: string): string[] =>
  list.includes(key) ? list.filter(k => k !== key) : [...list, key];

export const toggleCollapsedRow = (prefs: UserPrefs, boardId: string, rowKey: string): Partial<UserPrefs> => ({
  collapsedRows: {...prefs.collapsedRows, [boardId]: toggleInList(prefs.collapsedRows[boardId] ?? [], rowKey)}
});

export const toggleCollapsedColumn = (prefs: UserPrefs, boardId: string, columnId: string): Partial<UserPrefs> => ({
  collapsedColumns: {...prefs.collapsedColumns, [boardId]: toggleInList(prefs.collapsedColumns[boardId] ?? [], columnId)}
});

export const toggleCollapsedOuterRow = (prefs: UserPrefs, boardId: string, outerKey: string): Partial<UserPrefs> => ({
  collapsedOuterRows: {...prefs.collapsedOuterRows, [boardId]: toggleInList(prefs.collapsedOuterRows[boardId] ?? [], outerKey)}
});

export const toggleCollapsedGroup = (prefs: UserPrefs, boardId: string, groupKey: string): Partial<UserPrefs> => ({
  collapsedGroups: {...prefs.collapsedGroups, [boardId]: toggleInList(prefs.collapsedGroups[boardId] ?? [], groupKey)}
});
