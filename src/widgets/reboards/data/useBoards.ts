import {useCallback, useEffect, useState} from 'react';
import {type BoardConfig, normalizeBoardConfig} from '@/common/model/board-config';
import {detectLostWrite} from '@/common/model/board-merge';
import {errorData, errorMessage} from '@/common/youtrack/rest';
import {api} from './api';

export type BoardsState = {
  boards: BoardConfig[];
  editableIds: Set<string>;
  deletableIds: Set<string>;
  me: {login: string; isAdmin: boolean} | null;
  loading: boolean;
  error: string | null;
};

/** Outcome of a save: stored, rejected because someone else saved first, or the board no longer exists. */
export type SaveResult =
  | {kind: 'saved'; board: BoardConfig}
  | {kind: 'conflict'; current: BoardConfig}
  | {kind: 'gone'};

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** Time for a simultaneous write to commit before the list is read back. */
const CHECK_DELAY_MS = 300;

const LOST_MESSAGE = 'Your change was overwritten by a simultaneous save. Please check the board.';

type BoardsListRes = Awaited<ReturnType<typeof api.global.boards.GET>>;

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const stateFrom = (res: BoardsListRes): BoardsState => ({
  boards: res.boards,
  editableIds: new Set(res.editableIds),
  deletableIds: new Set(res.deletableIds),
  me: res.me,
  loading: false,
  error: null
});

/** Saves once and turns the version conflict and missing board responses into results. */
const attemptSave = async (board: BoardConfig, baseVersion: number | undefined): Promise<SaveResult> => {
  try {
    const res = await api.global.boards.save.POST({board, baseVersion});
    return {kind: 'saved', board: res.board};
  } catch (error) {
    const data = errorData(error);
    if (data?.code === HTTP_CONFLICT && data.current) {
      return {kind: 'conflict', current: normalizeBoardConfig(data.current)};
    }
    if (data?.code === HTTP_NOT_FOUND) {
      return {kind: 'gone'};
    }
    throw error;
  }
};

export const useBoards = () => {
  const [state, setState] = useState<BoardsState>({boards: [], editableIds: new Set(), deletableIds: new Set(), me: null, loading: true, error: null});

  const reload = useCallback(async () => {
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      setState(stateFrom(await api.global.boards.GET()));
    } catch (error) {
      setState(prev => ({...prev, loading: false, error: errorMessage(error)}));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * All boards share one stored document and YouTrack does not detect two
   * writes landing together: the later one silently wins. So every write reads
   * the list back once the other write had time to commit. Null when the list
   * cannot be read: the write itself succeeded, so it is then taken as kept.
   */
  const readBack = useCallback(async (): Promise<BoardConfig[] | null> => {
    await delay(CHECK_DELAY_MS);
    try {
      const res = await api.global.boards.GET();
      setState(stateFrom(res));
      return res.boards;
    } catch {
      return null;
    }
  }, []);

  /** True unless the read-back list shows the board lost or older. */
  const survived = useCallback(async (board: BoardConfig): Promise<boolean> => {
    const boards = await readBack();
    return !boards || detectLostWrite(board, boards) === 'kept';
  }, [readBack]);

  /** Saves and checks the save survived; a lost save is redone once, or becomes a conflict to merge. */
  const save = useCallback(async (board: BoardConfig, baseVersion?: number): Promise<SaveResult> => {
    const first = await attemptSave(board, baseVersion);
    if (first.kind !== 'saved') {
      return first;
    }
    const boards = await readBack();
    if (!boards || detectLostWrite(first.board, boards) === 'kept') {
      return first;
    }
    const found = boards.find(b => b.id === first.board.id);
    if (found && found.version >= first.board.version) {
      // A simultaneous save of this board won: merge with it like any other conflict.
      return {kind: 'conflict', current: found};
    }
    // Another board's save wrote back the old document: redo ours on top of what is stored now.
    const retry = await attemptSave({...board, id: first.board.id}, found?.version);
    if (retry.kind !== 'saved') {
      return retry;
    }
    if (!(await survived(retry.board))) {
      throw new Error(LOST_MESSAGE);
    }
    return retry;
  }, [readBack, survived]);

  /** Hands a board over to another user; resolves to false when the current user can no longer see it. */
  const transfer = useCallback(async (id: string, login: string): Promise<boolean> => {
    const send = () => api.global.boards.owner.POST({id, login});
    let res = await send();
    if (!res.visible) {
      await readBack();
      return false;
    }
    if (!(await survived(res.board))) {
      res = await send();
      if (!(await survived(res.board))) {
        throw new Error(LOST_MESSAGE);
      }
    }
    return res.visible;
  }, [readBack, survived]);

  /** Deletes and checks the board stays gone; a simultaneous save may have written it back. */
  const remove = useCallback(async (id: string): Promise<void> => {
    const stillThere = async () => Boolean((await readBack())?.some(b => b.id === id));
    await api.global.boards.delete.POST({id});
    if (await stillThere()) {
      await api.global.boards.delete.POST({id});
      if (await stillThere()) {
        throw new Error('A simultaneous save restored the board. Delete it again');
      }
    }
  }, [readBack]);

  return {...state, reload, save, remove, transfer};
};
