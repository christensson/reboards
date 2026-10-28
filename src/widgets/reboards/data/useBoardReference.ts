import {useCallback, useEffect, useState} from 'react';
import type {ProjectRef} from '@/common/model/board-config';
import {errorMessage} from '@/common/youtrack/rest';
import type {YtIssueLinkType} from '@/common/youtrack/types';
import {type FieldUniverse, buildFieldUniverse, emptyUniverse} from '../model/fieldUniverse';
import {youtrack} from './api';

export type BoardReference = {
  universe: FieldUniverse;
  linkTypes: YtIssueLinkType[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const universeCache = new Map<string, FieldUniverse>();
let linkTypesCache: YtIssueLinkType[] | null = null;

const cacheKey = (projects: ProjectRef[]): string => projects.map(p => p.id).sort().join('|');

export const invalidateReferenceCache = (): void => {
  universeCache.clear();
  linkTypesCache = null;
};

/** Loads and caches the field universe and link types for a set of projects. */
export const useBoardReference = (projects: ProjectRef[]): BoardReference => {
  const key = cacheKey(projects);
  const [universe, setUniverse] = useState<FieldUniverse>(() => universeCache.get(key) ?? emptyUniverse());
  const [linkTypes, setLinkTypes] = useState<YtIssueLinkType[]>(() => linkTypesCache ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setError(null);
      const cachedUniverse = universeCache.get(key);
      if (cachedUniverse && linkTypesCache) {
        setUniverse(cachedUniverse);
        setLinkTypes(linkTypesCache);
        return;
      }
      setLoading(true);
      try {
        const [fieldsPerProject, types] = await Promise.all([
          Promise.all(projects.map(p => youtrack.getProjectFields(p.id))),
          linkTypesCache ? Promise.resolve(linkTypesCache) : youtrack.getLinkTypes()
        ]);
        if (cancelled) {
          return;
        }
        const built = buildFieldUniverse(fieldsPerProject);
        universeCache.set(key, built);
        linkTypesCache = types;
        setUniverse(built);
        setLinkTypes(types);
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // `projects` is represented by `key`; `version` forces a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => {
    invalidateReferenceCache();
    setVersion(v => v + 1);
  }, []);

  return {universe, linkTypes, loading, error, reload};
};
