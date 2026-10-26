import {useEffect, useState} from 'react';
import {youtrackBaseUrl} from '@/common/youtrack/host';
import {api} from './api';

let resolved: string | null = null;
let pending: Promise<string> | null = null;

/** Base URL from the backend (derived from an issue URL), falling back to the widget-side heuristic. */
export const loadBaseUrl = (): Promise<string> => {
  if (resolved) {
    return Promise.resolve(resolved);
  }
  if (pending) {
    return pending;
  }
  const request: Promise<string> = api.global.context
    .GET()
    .then(res => res.baseUrl || youtrackBaseUrl())
    .catch(() => youtrackBaseUrl())
    .then(url => {
      resolved = url;
      return url;
    });
  pending = request;
  return request;
};

export const useBaseUrl = (): string => {
  const [baseUrl, setBaseUrl] = useState<string>(() => resolved ?? youtrackBaseUrl());
  useEffect(() => {
    let active = true;
    loadBaseUrl().then(url => {
      if (active) {
        setBaseUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return baseUrl;
};
