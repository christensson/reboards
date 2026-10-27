import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {type CollisionDetection, type DragStartEvent, pointerWithin} from '@dnd-kit/core';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import {errorMessage} from '@/common/youtrack/rest';
import type {YtIssueLinkType} from '@/common/youtrack/types';
import {youtrack} from '../data/api';
import type {useBoardIssues} from '../data/useBoardIssues';
import {type BoardIssue, normalizeIssue} from '../model/issue';
import {
  LINK_CARD_PREFIX,
  LINK_GROUP_PREFIX,
  type LinkDropData,
  type LinkMode,
  type LinkTargetResult,
  type RelationOption,
  isLinkDropData,
  modeFromKeys,
  relationOptions,
  resolveLinkTarget,
  subtaskLinkType
} from '../model/linkTargets';
import type {LinkHighlight} from './BoardContext';
import type {RelationIssue} from './RelationPickerDialog';

type BoardData = ReturnType<typeof useBoardIssues>;

type Options = {
  issuesById: Map<string, BoardIssue>;
  linkTypes: YtIssueLinkType[];
  data: BoardData;
};

type RelationRequest = {from: BoardIssue; to: RelationIssue};

const isLinkId = (id: string | number): boolean => String(id).startsWith(LINK_CARD_PREFIX) || String(id).startsWith(LINK_GROUP_PREFIX);

const keyModifiers = (event: Event | null): {ctrlKey: boolean; metaKey: boolean; shiftKey: boolean} => {
  const e = event as Partial<KeyboardEvent> | null;
  return {ctrlKey: Boolean(e?.ctrlKey), metaKey: Boolean(e?.metaKey), shiftKey: Boolean(e?.shiftKey)};
};

/**
 * Ctrl-drag of an issue card changes its parent; Ctrl+Shift-drag adds a relation chosen in a dialog.
 * Plain drags are left to the regular cell logic: in that mode the link drop targets are ignored.
 */
export const useLinkDrag = ({issuesById, linkTypes, data}: Options) => {
  const [mode, setMode] = useState<LinkMode>('none');
  const [over, setOver] = useState<LinkDropData | null>(null);
  const [tracking, setTracking] = useState(false);
  const [relation, setRelation] = useState<RelationRequest | null>(null);
  const modeRef = useRef<LinkMode>('none');
  modeRef.current = mode;
  const overRef = useRef<LinkDropData | null>(null);
  overRef.current = over;

  // Follow the modifier keys for the whole drag, so pressing or releasing them switches mode.
  useEffect(() => {
    if (!tracking) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => setMode(modeFromKeys(event));
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [tracking]);

  const start = useCallback((event: DragStartEvent, isIssueDrag: boolean) => {
    setTracking(isIssueDrag);
    setMode(isIssueDrag ? modeFromKeys(keyModifiers(event.activatorEvent)) : 'none');
    setOver(null);
  }, []);

  const end = useCallback(() => {
    setTracking(false);
    setMode('none');
    setOver(null);
  }, []);

  const onOver = useCallback((dropData: unknown) => setOver(isLinkDropData(dropData) ? dropData : null), []);

  /** Plain drags see only cells (smallest first); link drags see only cards, then the smallest group box. */
  const collisionDetection = useMemo<CollisionDetection>(
    () => args => {
      const area = (id: string | number): number => {
        const rect = args.droppableRects.get(id);
        return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
      };
      const collisions = pointerWithin(args);
      if (modeRef.current === 'none') {
        return collisions.filter(c => !isLinkId(c.id)).sort((a, b) => area(a.id) - area(b.id));
      }
      const own = `${LINK_CARD_PREFIX}${String(args.active.id)}`;
      const rank = (id: string | number): number => (String(id).startsWith(LINK_CARD_PREFIX) ? 0 : 1);
      return collisions
        .filter(c => isLinkId(c.id) && c.id !== own)
        .sort((a, b) => rank(a.id) - rank(b.id) || area(a.id) - area(b.id));
    },
    []
  );

  const target = useCallback(
    (dragged: BoardIssue): LinkTargetResult | null =>
      mode === 'none' || !over ? null : resolveLinkTarget(over, dragged, mode, issuesById),
    [mode, over, issuesById]
  );

  const highlight = useMemo<LinkHighlight | null>(() => {
    if (mode === 'none' || !over) {
      return null;
    }
    return over.kind === 'link-card' ? {kind: 'card', id: over.issueId} : {kind: 'group', id: over.groupKey};
  }, [mode, over]);

  /** Reloads what a link change affects: single issues when all are on the board, else the whole board. */
  const refreshAfter = useCallback(
    async (ids: string[]) => {
      if (ids.every(id => issuesById.has(id))) {
        await Promise.all(ids.map(id => data.refetchIssue(id)));
      } else {
        data.refresh();
      }
    },
    [issuesById, data]
  );

  const changeParent = useCallback(
    async (childId: string, parentId: string) => {
      const type = subtaskLinkType(linkTypes);
      if (!type) {
        alertService.error('No Subtask link type available');
        return;
      }
      const onBoard = issuesById.get(childId);
      const label = onBoard?.idReadable ?? childId;
      try {
        // Fresh parents: the board may not know an off-board child's links.
        const current = onBoard ?? normalizeIssue(await youtrack.getIssue(childId));
        const oldParents = current.parentIds.filter(id => id !== parentId);
        if (onBoard) {
          data.replaceIssue({...onBoard, parentIds: [parentId]});
        }
        for (const oldParent of oldParents) {
          await youtrack.removeLink(childId, `${type.id}t`, oldParent);
        }
        await youtrack.addLink(childId, `${type.id}t`, parentId);
        await refreshAfter([childId, parentId, ...oldParents]);
      } catch (failure) {
        if (onBoard) {
          data.replaceIssue(onBoard);
        }
        alertService.error(`Could not change the parent of ${label}: ${errorMessage(failure)}`);
      }
    },
    [linkTypes, issuesById, data, refreshAfter]
  );

  const addRelation = useCallback(
    async (option: RelationOption) => {
      setRelation(null);
      const {action} = option;
      if (action.kind === 'parent') {
        await changeParent(action.childId, action.parentId);
        return;
      }
      try {
        await youtrack.addLink(action.issueId, action.linkId, action.otherId);
        await refreshAfter([action.issueId, action.otherId]);
      } catch (failure) {
        alertService.error(`Could not add the relation: ${errorMessage(failure)}`);
      }
    },
    [changeParent, refreshAfter]
  );

  /** Handles the drop of a link drag; returns false for plain drags so the cell logic runs. */
  const drop = useCallback(
    (dragged: BoardIssue | undefined): boolean => {
      const dropMode = modeRef.current;
      const dropOver = overRef.current;
      end();
      if (dropMode === 'none') {
        return false;
      }
      if (!dragged || !dropOver) {
        return true;
      }
      const result = resolveLinkTarget(dropOver, dragged, dropMode, issuesById);
      if ('invalid' in result) {
        return true;
      }
      if (dropMode === 'parent') {
        changeParent(dragged.id, result.targetId);
      } else {
        const to = issuesById.get(result.targetId);
        setRelation({from: dragged, to: {id: result.targetId, idReadable: result.targetLabel, summary: to?.summary ?? ''}});
      }
      return true;
    },
    [end, issuesById, changeParent]
  );

  const dialog = {
    from: relation?.from ?? null,
    to: relation?.to ?? null,
    options: relation ? relationOptions(linkTypes, relation.from, relation.to) : [],
    onAdd: addRelation,
    onCancel: () => setRelation(null)
  };

  return {mode, start, end, onOver, collisionDetection, target, highlight, drop, dialog};
};
