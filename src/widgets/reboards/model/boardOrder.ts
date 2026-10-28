import type {BoardConfig} from '@/common/model/board-config';

export type OrderedBoards = {
  starred: BoardConfig[];
  others: BoardConfig[];
};

const byName = (a: BoardConfig, b: BoardConfig) => a.name.localeCompare(b.name);

/** Splits boards into starred and other boards, each sorted by name. */
export const orderBoards = (boards: BoardConfig[], starredIds: string[]): OrderedBoards => {
  const starred = new Set(starredIds);
  return {
    starred: boards.filter(b => starred.has(b.id)).sort(byName),
    others: boards.filter(b => !starred.has(b.id)).sort(byName)
  };
};
