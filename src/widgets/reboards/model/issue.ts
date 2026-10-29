import {type FieldValue, toFieldValue} from '@/common/youtrack/fields';
import type {YtColor, YtIssue, YtIssueLink, YtLinkDirection} from '@/common/youtrack/types';

/** Name of the built-in aggregation link type that defines parent/subtask relations. */
export const SUBTASK_LINK_TYPE = 'Subtask';

export type IssueLink = {
  typeId: string;
  typeName: string;
  sourceToTarget: string;
  targetToSource: string;
  directed: boolean;
  aggregation: boolean;
  direction: YtLinkDirection;
  issueIds: string[];
};

export type IssueTag = {
  id: string;
  name: string;
  color?: YtColor;
};

export type BoardIssue = {
  id: string;
  idReadable: string;
  summary: string;
  projectId: string;
  projectShortName: string;
  /** Numeric part of idReadable, used for stable ordering. */
  number: number;
  tags: IssueTag[];
  fields: Record<string, FieldValue | null>;
  links: IssueLink[];
  /** Ids of parent issues (Subtask links pointing inward). */
  parentIds: string[];
  /** Ids of subtasks (Subtask links pointing outward). */
  childIds: string[];
  /** The issue is resolved (YouTrack's own resolved date is set). */
  resolved?: boolean;
};

const issueNumber = (idReadable: string): number => {
  const match = idReadable.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const normalizeLink = (link: YtIssueLink): IssueLink => ({
  typeId: link.linkType.id,
  typeName: link.linkType.name,
  sourceToTarget: link.linkType.sourceToTarget,
  targetToSource: link.linkType.targetToSource,
  directed: link.linkType.directed,
  aggregation: link.linkType.aggregation,
  direction: link.direction,
  issueIds: (link.issues ?? []).map(i => i.id)
});

export const normalizeIssue = (issue: YtIssue): BoardIssue => {
  const fields: Record<string, FieldValue | null> = {};
  (issue.customFields ?? []).forEach(cf => {
    fields[cf.name] = toFieldValue(cf);
  });
  const links = (issue.links ?? []).filter(l => l.issues && l.issues.length > 0).map(normalizeLink);
  const subtaskLinks = links.filter(l => l.aggregation && l.typeName === SUBTASK_LINK_TYPE);
  return {
    id: issue.id,
    idReadable: issue.idReadable,
    summary: issue.summary ?? '',
    projectId: issue.project?.id ?? '',
    projectShortName: issue.project?.shortName ?? '',
    number: issueNumber(issue.idReadable),
    tags: (issue.tags ?? []).map(t => ({id: t.id, name: t.name, ...(t.color ? {color: t.color} : {})})),
    fields,
    links,
    parentIds: subtaskLinks.filter(l => l.direction === 'INWARD').flatMap(l => l.issueIds),
    childIds: subtaskLinks.filter(l => l.direction === 'OUTWARD').flatMap(l => l.issueIds),
    resolved: typeof issue.resolved === 'number'
  };
};

/** Natural ordering of issues: by project short name, then by issue number. */
export const compareIssues = (a: BoardIssue, b: BoardIssue): number =>
  a.projectShortName.localeCompare(b.projectShortName) || a.number - b.number;
