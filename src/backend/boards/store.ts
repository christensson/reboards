import {type BoardConfig, type ProjectRef, legacyTimeline, normalizeBoardConfig} from '@/common/model/board-config';

/** Permission key that grants edit rights on every shared board. */
export const ADMIN_PERMISSION = 'ADMIN_UPDATE_APP';

/** Settings added after the first release; a save from an older widget leaves them out. */
const LATER_SETTINGS = ['pages', 'gantt'] as const;

type RawTimeline = {field?: {name?: unknown} | null; periodField?: {name?: unknown} | null; dateRole?: unknown};

/** Whether a 1.3.0 widget sent back the time setup it was given: its field, period and meaning unchanged. */
const sameLegacyTimeline = (raw: RawTimeline, existing: BoardConfig): boolean => {
  const before = legacyTimeline(existing);
  return (raw.field?.name ?? null) === (before.field?.name ?? null)
    && (raw.periodField?.name ?? null) === (before.periodField?.name ?? null)
    && (before.field === null || raw.dateRole === before.dateRole);
};

/**
 * The time and plan settings of a save from a 1.3.0 widget, which only knows one time field: the
 * stored ones when it sent back the time setup it was given; else its change, converted onto the
 * stored plan as a 1.3.0 board is on load, or the time layout turned off when it cleared the field.
 */
const legacyTimeSettings = (raw: Record<string, unknown>, timeline: RawTimeline, existing: BoardConfig): Pick<BoardConfig, 'timeline' | 'gantt'> => {
  if (sameLegacyTimeline(timeline, existing)) {
    return {timeline: existing.timeline, gantt: existing.gantt};
  }
  if (!timeline.field) {
    return {timeline: {...existing.timeline, enabled: false}, gantt: existing.gantt};
  }
  const converted = normalizeBoardConfig({...raw, gantt: existing.gantt});
  return {timeline: converted.timeline, gantt: converted.gantt};
};

/**
 * Settings a save leaves out keep their stored value. A browser still running an older widget sends
 * boards without the settings added since (such as `pages`), which would otherwise be reset. A
 * 1.3.0 widget sends a time field instead of today's time rows and plan, and cannot keep a Gantt
 * default layout (it turns it into swimlanes).
 */
export const keepOmittedSettings = (incoming: BoardConfig, raw: unknown, existing: BoardConfig): BoardConfig => {
  if (typeof raw !== 'object' || raw === null) {
    return incoming;
  }
  const kept: BoardConfig = {...incoming};
  LATER_SETTINGS.filter(key => !(key in raw)).forEach(key => {
    Object.assign(kept, {[key]: existing[key]});
  });
  const timeline = (raw as {timeline?: unknown}).timeline;
  if (typeof timeline === 'object' && timeline !== null && !('rowsBy' in timeline)) {
    Object.assign(kept, legacyTimeSettings(raw as Record<string, unknown>, timeline as RawTimeline, existing));
    if (existing.defaultRowMode === 'gantt' && kept.defaultRowMode === 'swimlanes') {
      kept.defaultRowMode = 'gantt';
    }
  }
  return JSON.stringify(kept) === JSON.stringify(incoming) ? incoming : kept;
};

/** Whether the current user can read issues in a project. */
export type ProjectAccess = (project: ProjectRef) => boolean;

/** The user a request is made for: login for display, id (stable) for ownership. */
export type Viewer = {
  login: string;
  id: string;
};

/** Ownership follows the stable id; boards stored before ids were recorded fall back to the login. */
export const isOwner = (board: BoardConfig, viewer: Viewer): boolean =>
  board.ownerId ? board.ownerId === viewer.id : board.owner === viewer.login;

/**
 * Owners always see their boards. Others see a shared board only when they can
 * read every one of its projects, so its settings never reveal a hidden project.
 */
export const isVisibleTo = (board: BoardConfig, viewer: Viewer, canReadProject: ProjectAccess): boolean =>
  isOwner(board, viewer) || (board.shared && board.projects.every(canReadProject));

const adminOfAll = (board: BoardConfig, isProjectAdmin: ProjectAccess): boolean =>
  board.projects.length > 0 && board.projects.every(isProjectAdmin);

/**
 * Owners manage their boards. Shared boards may also be managed by system
 * admins and by whoever administers every one of the board's projects.
 */
export const canEdit = (board: BoardConfig, viewer: Viewer, isAdmin: boolean, isProjectAdmin: ProjectAccess): boolean =>
  isOwner(board, viewer) || (board.shared && (isAdmin || adminOfAll(board, isProjectAdmin)));

/** Whoever may change a board may also delete it. */
export const canDelete = canEdit;

/** Whoever may change a board may also hand it over to another user. */
export const canTransfer = canEdit;

/**
 * Owners share their own boards when they can update issues in every one of its projects; system admins
 * and admins of all its projects need no more than ownership. Checked only when a board becomes shared.
 */
export const canShare = (board: BoardConfig, viewer: Viewer, isAdmin: boolean, isProjectAdmin: ProjectAccess, canUpdateIssues: ProjectAccess): boolean =>
  isOwner(board, viewer) && (isAdmin || adminOfAll(board, isProjectAdmin) || (board.projects.length > 0 && board.projects.every(canUpdateIssues)));

export const visibleBoards = (boards: BoardConfig[], viewer: Viewer, canReadProject: ProjectAccess): BoardConfig[] =>
  boards.filter(b => isVisibleTo(b, viewer, canReadProject));

/** A save must start from the stored version; a missing base version never matches an existing board. */
export const versionMatches = (existing: BoardConfig, baseVersion: number | undefined): boolean => baseVersion === existing.version;

/** Boards one user may own, so nobody can fill the shared storage on their own. */
export const MAX_BOARDS_PER_OWNER = 100;

export const ownedBy = (boards: BoardConfig[], viewer: Viewer): number => boards.filter(b => isOwner(b, viewer)).length;

/** Login of the anonymous user; every visitor shares it, so it must not own boards. */
export const GUEST_LOGIN = 'guest';
