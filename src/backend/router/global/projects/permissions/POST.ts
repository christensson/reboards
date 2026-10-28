import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {projectAdminFor, projectPermissionFor} from '@/backend/boards/access';

/**
 * @zod-to-schema
 */
export type ProjectsPermissionsReq = {
  shortNames: string[];
};

/**
 * @zod-to-schema
 */
export type ProjectsPermissionsRes = {
  /** The requested projects the current user administers. */
  adminShortNames: string[];
  /** The requested projects whose issues the current user may change. */
  updateShortNames: string[];
  /** The requested projects whose issues the current user may link. */
  linkShortNames: string[];
};

function handle(ctx: CtxPost<ProjectsPermissionsReq, ProjectsPermissionsRes, never, 'global'>): void {
  const {shortNames} = ctx.request.json();
  const requested = (Array.isArray(shortNames) ? shortNames.filter(name => typeof name === 'string') : []).map(shortName => ({id: '', shortName}));
  const granted = (check: (project: {id: string; shortName: string}) => boolean): string[] => requested.filter(check).map(p => p.shortName);
  ctx.response.json({
    adminShortNames: granted(projectAdminFor(ctx.currentUser)),
    updateShortNames: granted(projectPermissionFor(ctx.currentUser, 'UPDATE_ISSUE')),
    linkShortNames: granted(projectPermissionFor(ctx.currentUser, 'LINK_ISSUE'))
  });
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
