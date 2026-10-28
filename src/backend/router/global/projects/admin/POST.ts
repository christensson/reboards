import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {projectAdminFor} from '@/backend/boards/access';

/**
 * @zod-to-schema
 */
export type ProjectsAdminReq = {
  shortNames: string[];
};

/**
 * @zod-to-schema
 */
export type ProjectsAdminRes = {
  /** The requested projects the current user administers. */
  adminShortNames: string[];
};

function handle(ctx: CtxPost<ProjectsAdminReq, ProjectsAdminRes, never, 'global'>): void {
  const isProjectAdmin = projectAdminFor(ctx.currentUser);
  const {shortNames} = ctx.request.json();
  const requested = Array.isArray(shortNames) ? shortNames.filter(name => typeof name === 'string') : [];
  ctx.response.json({adminShortNames: requested.filter(shortName => isProjectAdmin({id: '', shortName}))});
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
