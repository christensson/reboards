import {useEffect, useState} from 'react';
import {isPersonalAgile, sprintValues} from '@/common/model/agileSource';
import type {BoardConfig} from '@/common/model/board-config';
import {errorMessage} from '@/common/youtrack/rest';
import type {UniverseValue} from '../model/fieldUniverse';
import {youtrack} from './api';

/** The live state of a board's linked agile board. */
export type AgileInfo = {
  id: string;
  /** The current name; the board may have been renamed since the link was made. */
  name: string;
  sprintsEnabled: boolean;
  sprints: UniverseValue[];
  personal: boolean;
};

export type AgileSourceState =
  | {status: 'none'}
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; agile: AgileInfo};

/** Loads the agile board a ReBoards board takes its issues from; `none` for boards that are not linked. */
export const useAgileSource = (config: BoardConfig): AgileSourceState => {
  const id = config.agileSource?.id ?? null;
  const [state, setState] = useState<AgileSourceState>(id ? {status: 'loading'} : {status: 'none'});
  useEffect(() => {
    if (!id) {
      setState({status: 'none'});
      return undefined;
    }
    let cancelled = false;
    setState({status: 'loading'});
    youtrack
      .getAgile(id)
      .then(agile => {
        if (!cancelled) {
          setState({
            status: 'ready',
            agile: {
              id: agile.id,
              name: agile.name,
              sprintsEnabled: !agile.sprintsSettings?.disableSprints,
              sprints: sprintValues(agile.sprints ?? []),
              personal: isPersonalAgile(agile)
            }
          });
        }
      })
      .catch(error => {
        if (!cancelled) {
          setState({status: 'error', message: errorMessage(error)});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return state;
};
