import {useCallback, useEffect, useRef, useState} from 'react';
import type {BoardConfig} from '@/common/model/board-config';
import {composeQuery} from '@/common/youtrack/query';
import {errorMessage} from '@/common/youtrack/rest';
import {type BoardIssue, normalizeIssue} from '../model/issue';
import type {ParentInfo} from '../model/layout';
import {youtrack} from './api';

export type IssuesState = {
  issues: BoardIssue[];
  parents: Record<string, ParentInfo>;
  loading: boolean;
  loadedCount: number;
  truncated: boolean;
  error: string | null;
};

const PARENT_FETCH_CONCURRENCY = 6;

const fetchParents = async (ids: string[]): Promise<Record<string, ParentInfo>> => {
  const result: Record<string, ParentInfo> = {};
  const queue = [...ids];
  const worker = async (): Promise<void> => {
    for (;;) {
      const id = queue.shift();
      if (id === undefined) {
        return;
      }
      try {
        const issue = normalizeIssue(await youtrack.getIssue(id));
        result[id] = {id, idReadable: issue.idReadable, summary: issue.summary, childCount: issue.childIds.length};
      } catch {
        result[id] = {id, idReadable: id, summary: '(not accessible)', childCount: null};
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(PARENT_FETCH_CONCURRENCY, ids.length)}, worker));
  return result;
};

export const effectiveQuery = (config: BoardConfig, sprint: string | null): string =>
  composeQuery({
    projects: config.projects.map(p => p.shortName),
    query: config.query,
    sprintField: config.sprints.enabled ? config.sprints.field?.name : null,
    sprint: config.sprints.enabled ? sprint : null
  });

/** Loads the issues of a board (paged) plus the parents of subtasks that are not on the board. */
export const useBoardIssues = (config: BoardConfig, sprint: string | null) => {
  const [state, setState] = useState<IssuesState>({issues: [], parents: {}, loading: true, loadedCount: 0, truncated: false, error: null});
  const [version, setVersion] = useState(0);
  const query = effectiveQuery(config, sprint);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const isCurrent = (): boolean => requestId.current === id;
    setState(prev => ({...prev, loading: true, error: null, loadedCount: 0}));
    const run = async () => {
      try {
        const result = await youtrack.searchIssues(query, loaded => {
          if (isCurrent()) {
            setState(prev => ({...prev, loadedCount: loaded}));
          }
        });
        if (!isCurrent()) {
          return;
        }
        const issues = result.issues.map(normalizeIssue);
        const loadedIds = new Set(issues.map(i => i.id));
        const missingParents = Array.from(new Set(issues.flatMap(i => i.parentIds).filter(pid => !loadedIds.has(pid))));
        setState(prev => ({...prev, issues, truncated: result.truncated, loading: missingParents.length > 0}));
        if (missingParents.length > 0) {
          const parents = await fetchParents(missingParents);
          if (isCurrent()) {
            setState(prev => ({...prev, parents, loading: false}));
          }
        } else {
          setState(prev => ({...prev, parents: {}, loading: false}));
        }
      } catch (e) {
        if (isCurrent()) {
          setState(prev => ({...prev, loading: false, error: errorMessage(e)}));
        }
      }
    };
    run();
  }, [query, version]);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  /** Replaces one issue in the local state (optimistic updates and single refetches). */
  const replaceIssue = useCallback((issue: BoardIssue) => {
    setState(prev => ({...prev, issues: prev.issues.map(i => (i.id === issue.id ? issue : i))}));
  }, []);

  const refetchIssue = useCallback(async (issueId: string) => {
    const issue = normalizeIssue(await youtrack.getIssue(issueId));
    replaceIssue(issue);
    return issue;
  }, [replaceIssue]);

  return {...state, query, refresh, replaceIssue, refetchIssue};
};
