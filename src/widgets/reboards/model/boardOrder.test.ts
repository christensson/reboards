import {describe, expect, it} from 'vitest';
import {createEmptyBoard} from '@/common/model/board-config';
import {orderBoards} from './boardOrder';

const board = (id: string, name: string) => ({...createEmptyBoard('me'), id, name});

describe('orderBoards', () => {
  const boards = [board('a', 'Zeta'), board('b', 'Alpha'), board('c', 'Mid'), board('d', 'Beta')];

  it('puts starred boards first, both parts sorted by name', () => {
    const ordered = orderBoards(boards, ['a', 'd', 'gone']);
    expect(ordered.starred.map(b => b.name)).toEqual(['Beta', 'Zeta']);
    expect(ordered.others.map(b => b.name)).toEqual(['Alpha', 'Mid']);
  });

  it('has no starred section without stars', () => {
    expect(orderBoards(boards, []).starred).toEqual([]);
  });
});
