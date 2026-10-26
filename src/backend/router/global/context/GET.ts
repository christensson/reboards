import {resolveBaseUrl} from '@/backend/boards/context';

/**
 * @zod-to-schema
 */
export type ContextRes = {
  /** Absolute base URL of this YouTrack installation, or null when it cannot be derived. */
  baseUrl: string | null;
};

export default function handle(ctx: CtxGet<ContextRes, never, 'global'>): void {
  ctx.response.json({baseUrl: resolveBaseUrl(ctx.currentUser)});
}

export type Handle = typeof handle;
