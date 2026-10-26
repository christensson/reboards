import {type HostAPI} from '../../@types/globals';
import {type ApiRouter} from './api';
import {appId} from '../app-id';
import {createApiLogger} from '../common/utils/logger';
import {createApi as createApiBase} from '@jetbrains/youtrack-apps-tools/dx/api';

type BaseHost = Parameters<typeof createApiBase>[0];

export const createApi = <T extends ApiRouter>(host: HostAPI) => {
  // The host object satisfies the base client at runtime; the Ring UI RequestParams
  // typing of `query` is just stricter than the client's own declaration.
  return createApiBase<T>(host as unknown as BaseHost, {
    appId,
    loggerFactory: (scope) => createApiLogger(scope),
    // Only validate in dev builds — tree-shakes api.zod.ts out of production bundles
    zodImport: import.meta.env.DEV ? () => import('./api.zod') : undefined
  });
};
