import {withPermissions} from '@jetbrains/youtrack-apps-tools/dx/runtime';
import {resolveBaseUrl} from '@/backend/boards/context';

/**
 * @zod-to-schema
 */
export type ContextRes = {
  /** Absolute base URL of this YouTrack installation, or null when it cannot be derived. */
  baseUrl: string | null;
};

function handle(ctx: CtxGet<ContextRes, never, 'global'>): void {
  ctx.response.json({baseUrl: resolveBaseUrl(ctx.currentUser)});
}

// Only users who can read issues somewhere may call this endpoint.
export default withPermissions(handle, ['READ_ISSUE']);

export type Handle = typeof handle;
