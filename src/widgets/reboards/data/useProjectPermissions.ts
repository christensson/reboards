import {useEffect, useMemo, useState} from 'react';
import type {ProjectRef} from '@/common/model/board-config';
import {api} from './api';

export type ProjectPermissions = {
  /** False until the permissions are known; until then nothing is locked, YouTrack still checks every change. */
  ready: boolean;
  canUpdate: (shortName: string) => boolean;
  canLink: (shortName: string) => boolean;
};

type Granted = {update: Set<string>; link: Set<string>};

const cache = new Map<string, Granted>();

const cacheKey = (projects: ProjectRef[]): string => projects.map(p => p.shortName).sort().join('|');

const permissionsOf = (granted: Granted | undefined): ProjectPermissions =>
  granted
    ? {ready: true, canUpdate: shortName => granted.update.has(shortName), canLink: shortName => granted.link.has(shortName)}
    : {ready: false, canUpdate: () => true, canLink: () => true};

/** What the current user may change in the board's projects, so the board can lock what would be rejected. */
export const useProjectPermissions = (projects: ProjectRef[]): ProjectPermissions => {
  const key = cacheKey(projects);
  const [granted, setGranted] = useState<Granted | undefined>(() => cache.get(key));

  useEffect(() => {
    const cached = cache.get(key);
    setGranted(cached);
    if (cached || !key) {
      return undefined;
    }
    let cancelled = false;
    api.global.projects.permissions
      .POST({shortNames: key.split('|')})
      .then(res => {
        const loaded = {update: new Set(res.updateShortNames), link: new Set(res.linkShortNames)};
        cache.set(key, loaded);
        if (!cancelled) {
          setGranted(loaded);
        }
      })
      .catch(() => {
        // Without the permissions nothing is locked; YouTrack still rejects changes it does not allow.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => permissionsOf(granted), [granted]);
};
