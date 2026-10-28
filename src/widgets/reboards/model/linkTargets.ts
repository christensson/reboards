import type {YtIssueLinkType} from '@/common/youtrack/types';
import {type BoardIssue, SUBTASK_LINK_TYPE} from './issue';

/** What a modifier-drag does: 'parent' (Ctrl) sets the parent, 'relation' (Ctrl+Shift) adds a chosen relation. */
export type LinkMode = 'none' | 'parent' | 'relation';

export const LINK_CARD_PREFIX = 'link-card:';
export const LINK_GROUP_PREFIX = 'link-group:';

/** Droppable data of link targets: an issue card, or a parent group box (standing for its parent issue). */
export type LinkDropData =
  | {kind: 'link-card'; issueId: string}
  | {kind: 'link-group'; groupKey: string; parentId: string; parentIdReadable: string};

export const isLinkDropData = (data: unknown): data is LinkDropData =>
  typeof data === 'object' && data !== null && ((data as {kind?: unknown}).kind === 'link-card' || (data as {kind?: unknown}).kind === 'link-group');

export type LinkTarget = {targetId: string; targetLabel: string};
export type LinkTargetResult = LinkTarget | {invalid: string};

export const modeFromKeys = (keys: {ctrlKey: boolean; metaKey: boolean; shiftKey: boolean}): LinkMode => {
  if (!keys.ctrlKey && !keys.metaKey) {
    return 'none';
  }
  return keys.shiftKey ? 'relation' : 'parent';
};

/** True when `candidateId` is a subtask (at any depth) of `issueId`, as far as the board knows. */
export const isDescendant = (issueId: string, candidateId: string, issuesById: Map<string, BoardIssue>): boolean => {
  const seen = new Set<string>();
  const stack = [...(issuesById.get(issueId)?.childIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === candidateId) {
      return true;
    }
    if (!seen.has(id)) {
      seen.add(id);
      stack.push(...(issuesById.get(id)?.childIds ?? []));
    }
  }
  return false;
};

/** Resolves the issue a dragged card would be linked to, or why it can't be. */
export const resolveLinkTarget = (
  data: LinkDropData,
  dragged: BoardIssue,
  mode: Exclude<LinkMode, 'none'>,
  issuesById: Map<string, BoardIssue>
): LinkTargetResult => {
  const targetId = data.kind === 'link-card' ? data.issueId : data.parentId;
  const targetLabel = data.kind === 'link-card' ? (issuesById.get(targetId)?.idReadable ?? targetId) : data.parentIdReadable;
  if (targetId === dragged.id) {
    return {invalid: `${dragged.idReadable} can't be linked to itself`};
  }
  if (mode === 'parent') {
    if (dragged.parentIds.includes(targetId)) {
      return {invalid: `${targetLabel} is already the parent of ${dragged.idReadable}`};
    }
    if (isDescendant(dragged.id, targetId, issuesById)) {
      return {invalid: `${targetLabel} is a subtask of ${dragged.idReadable} and can't become its parent`};
    }
  }
  return {targetId, targetLabel};
};

/** Applying a relation option: a plain link, or a parent change for the Subtask type. */
export type RelationAction = {kind: 'link'; issueId: string; linkId: string; otherId: string} | {kind: 'parent'; childId: string; parentId: string};

export type RelationOption = {
  key: string;
  typeName: string;
  /** Relation name as read from the dragged issue, e.g. "depends on". */
  verb: string;
  existing: boolean;
  action: RelationAction;
};

const hasLink = (issue: BoardIssue, typeId: string, direction: string, otherId: string): boolean =>
  issue.links.some(l => l.typeId === typeId && l.direction === direction && l.issueIds.includes(otherId));

/**
 * Relations that can be added from `from` to `to`, phrased from `from`'s side.
 * Link ids follow the REST API: `<typeId>s` is the outward end, `<typeId>t` the inward end, the bare id an undirected type.
 */
export const relationOptions = (linkTypes: YtIssueLinkType[], from: BoardIssue, to: {id: string}): RelationOption[] =>
  linkTypes.flatMap(type => {
    if (!type.directed) {
      return [{
        key: type.id,
        typeName: type.name,
        verb: type.sourceToTarget,
        existing: hasLink(from, type.id, 'BOTH', to.id),
        action: {kind: 'link', issueId: from.id, linkId: type.id, otherId: to.id}
      } satisfies RelationOption];
    }
    const subtask = type.name === SUBTASK_LINK_TYPE && type.aggregation;
    return [
      {
        key: `${type.id}t`,
        typeName: type.name,
        verb: type.targetToSource,
        existing: hasLink(from, type.id, 'INWARD', to.id),
        action: subtask ? {kind: 'parent', childId: from.id, parentId: to.id} : {kind: 'link', issueId: from.id, linkId: `${type.id}t`, otherId: to.id}
      } satisfies RelationOption,
      {
        key: `${type.id}s`,
        typeName: type.name,
        verb: type.sourceToTarget,
        existing: hasLink(from, type.id, 'OUTWARD', to.id),
        action: subtask ? {kind: 'parent', childId: to.id, parentId: from.id} : {kind: 'link', issueId: from.id, linkId: `${type.id}s`, otherId: to.id}
      } satisfies RelationOption
    ];
  });

export const subtaskLinkType = (linkTypes: YtIssueLinkType[]): YtIssueLinkType | undefined =>
  linkTypes.find(t => t.name === SUBTASK_LINK_TYPE && t.aggregation);
