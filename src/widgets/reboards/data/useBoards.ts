import {useCallback, useEffect, useState} from 'react';
import type {BoardConfig} from '@/common/model/board-config';
import {errorMessage} from '@/common/youtrack/rest';
import {api} from './api';

export type BoardsState = {
  boards: BoardConfig[];
  editableIds: Set<string>;
  deletableIds: Set<string>;
  me: {login: string; isAdmin: boolean} | null;
  loading: boolean;
  error: string | null;
};

export const useBoards = () => {
  const [state, setState] = useState<BoardsState>({boards: [], editableIds: new Set(), deletableIds: new Set(), me: null, loading: true, error: null});

  const reload = useCallback(async () => {
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      const res = await api.global.boards.GET();
      setState({
        boards: res.boards,
        editableIds: new Set(res.editableIds),
        deletableIds: new Set(res.deletableIds),
        me: res.me, loading: false, error: null});
    } catch (error) {
      setState(prev => ({...prev, loading: false, error: errorMessage(error)}));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (board: BoardConfig, expectedUpdatedAt?: number): Promise<BoardConfig> => {
    const res = await api.global.boards.save.POST({board, expectedUpdatedAt});
    setState(prev => {
      const others = prev.boards.filter(b => b.id !== res.board.id);
      const editableIds = new Set(prev.editableIds);
      const deletableIds = new Set(prev.deletableIds);
      if (res.canEdit) {
        editableIds.add(res.board.id);
      }
      if (res.canDelete) {
        deletableIds.add(res.board.id);
      }
      return {...prev, boards: [...others, res.board].sort((a, b) => a.name.localeCompare(b.name)), editableIds, deletableIds};
    });
    return res.board;
  }, []);

  /** Hands a board over to another user; resolves to false when the current user can no longer see it. */
  const transfer = useCallback(async (id: string, login: string): Promise<boolean> => {
    const res = await api.global.boards.owner.POST({id, login});
    setState(prev => {
      const editableIds = new Set(prev.editableIds);
      const deletableIds = new Set(prev.deletableIds);
      editableIds.delete(id);
      deletableIds.delete(id);
      if (res.canEdit) {
        editableIds.add(id);
      }
      if (res.canDelete) {
        deletableIds.add(id);
      }
      const others = prev.boards.filter(b => b.id !== id);
      return {...prev, boards: res.visible ? prev.boards.map(b => (b.id === id ? res.board : b)) : others, editableIds, deletableIds};
    });
    return res.visible;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await api.global.boards.delete.POST({id});
    setState(prev => ({...prev, boards: prev.boards.filter(b => b.id !== id)}));
  }, []);

  return {...state, reload, save, remove, transfer};
};
