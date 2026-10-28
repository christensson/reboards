import type {HostAPI} from '../../../@types/globals';
import type {IssueFieldUpdate} from './fields';
import type {YtIssue, YtIssueLinkType, YtProject, YtProjectCustomField, YtSearchAssist, YtUser} from './types';

export const ISSUE_FIELDS = [
  'id',
  'idReadable',
  'summary',
  'project(id,shortName)',
  'tags(id,name,color(background,foreground))',
  'customFields(id,name,$type,value(id,name,login,fullName,avatarUrl,presentation,color(background,foreground),isResolved))',
  'links(id,direction,linkType(id,name,sourceToTarget,targetToSource,directed,aggregation),issues(id,idReadable))'
].join(',');

export const PROJECT_FIELD_FIELDS =
  'id,$type,canBeEmpty,field(id,name,fieldType(id,valueType)),bundle(id,$type,values(id,name,ordinal,isResolved,startDate,releaseDate,color(background,foreground)),aggregatedUsers(id,login,fullName,avatarUrl))';

export const LINK_TYPE_FIELDS = 'id,name,sourceToTarget,targetToSource,directed,aggregation';

export const ASSIST_FIELDS =
  'query,caret,styleRanges(start,length,style),suggestions(prefix,option,suffix,description,matchingStart,matchingEnd,caret,completionStart,completionEnd,group,icon)';

export const ISSUE_PAGE_SIZE = 100;
export const ISSUE_LIMIT = 3000;
const PROJECTS_TOP = 500;
const USERS_TOP = 20;

export type IssueSearchResult = {
  issues: YtIssue[];
  truncated: boolean;
};

export const createYouTrackClient = (host: HostAPI) => {
  const get = <T>(path: string, query: Record<string, string | number>): Promise<T> =>
    host.fetchYouTrack(path, {query}) as Promise<T>;

  return {
    getProjects: (): Promise<YtProject[]> =>
      get<YtProject[]>('admin/projects', {fields: 'id,shortName,name', $top: PROJECTS_TOP}),

    getProjectFields: (projectId: string): Promise<YtProjectCustomField[]> =>
      get<YtProjectCustomField[]>(`admin/projects/${encodeURIComponent(projectId)}/customFields`, {
        fields: PROJECT_FIELD_FIELDS
      }),

    /** Active users matching a login or name fragment. */
    searchUsers: async (query: string): Promise<YtUser[]> => {
      const users = await get<YtUser[]>('users', {query, fields: 'id,login,fullName,avatarUrl,banned', $top: USERS_TOP});
      return users.filter(user => !user.banned);
    },

    getLinkTypes: (): Promise<YtIssueLinkType[]> => get<YtIssueLinkType[]>('issueLinkTypes', {fields: LINK_TYPE_FIELDS}),

    getIssue: (issueId: string): Promise<YtIssue> =>
      get<YtIssue>(`issues/${encodeURIComponent(issueId)}`, {fields: ISSUE_FIELDS}),

    searchIssues: async (query: string, onPage?: (loaded: number) => void): Promise<IssueSearchResult> => {
      const issues: YtIssue[] = [];
      let skip = 0;
      for (;;) {
        const page = await get<YtIssue[]>('issues', {query, fields: ISSUE_FIELDS, $top: ISSUE_PAGE_SIZE, $skip: skip});
        issues.push(...page);
        onPage?.(issues.length);
        if (page.length < ISSUE_PAGE_SIZE) {
          return {issues, truncated: false};
        }
        skip += ISSUE_PAGE_SIZE;
        if (issues.length >= ISSUE_LIMIT) {
          return {issues, truncated: true};
        }
      }
    },

    updateIssueFields: (issueId: string, updates: IssueFieldUpdate[]): Promise<unknown> =>
      host.fetchYouTrack(`issues/${encodeURIComponent(issueId)}`, {
        method: 'POST',
        query: {fields: 'id'},
        body: {customFields: updates}
      }),

    /** Adds `otherId` to the given link end of `issueId` (`<typeId>s`, `<typeId>t` or the id of an undirected type). */
    addLink: (issueId: string, linkId: string, otherId: string): Promise<unknown> =>
      host.fetchYouTrack(`issues/${encodeURIComponent(issueId)}/links/${encodeURIComponent(linkId)}/issues`, {
        method: 'POST',
        query: {fields: 'id'},
        body: {id: otherId}
      }),

    removeLink: (issueId: string, linkId: string, otherId: string): Promise<unknown> =>
      host.fetchYouTrack(`issues/${encodeURIComponent(issueId)}/links/${encodeURIComponent(linkId)}/issues/${encodeURIComponent(otherId)}`, {
        method: 'DELETE'
      }),

    searchAssist: (query: string, caret: number): Promise<YtSearchAssist> =>
      host.fetchYouTrack('search/assist', {
        method: 'POST',
        query: {fields: ASSIST_FIELDS},
        body: {query, caret}
      }) as Promise<YtSearchAssist>
  };
};

export type YouTrackClient = ReturnType<typeof createYouTrackClient>;

/** Extracts a readable message from a failed host fetch. */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const data = (error as {data?: {error_description?: string; error?: string}}).data;
    if (data?.error_description) {
      return data.error_description;
    }
    if (data?.error) {
      return data.error;
    }
  }
  return String(error);
};
