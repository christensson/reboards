type AppAPI = {
  onRefresh?: () => void;
  onConfigure?: () => void;
  onAppLocationChange?: (location: {pathname: string; search: string; hash: string}) => void;
};

import type AlertService from "@jetbrains/ring-ui-built/components/alert-service/alert-service";
import type { RequestParams } from "@jetbrains/ring-ui-built/components/http/http";

export interface HubService {
  id: string;
  applicationName: string;
  homeUrl: string;
}

interface BaseAPILayer {
  alert: (...args: Parameters<(typeof AlertService)["addAlert"]>) => void;
  enterModalMode: () => void;
  exitModalMode: () => void;
  collapse: () => void;
  reportWidgetSize: (size: { width: number; height: number }) => void;
  reportWidgetScroll?: (scroll: { yScrolled: boolean }) => void;
}

/*
 * This layer should allow plugin to call YT endpoints while being sure there is just ONE YouTrack instance
 */
export interface InstanceAwareAPILayer extends BaseAPILayer {
  fetchYouTrack: (
    relativeURL: string,
    requestParams: RequestParams,
  ) => Promise<unknown>;
}

/*
 * This layer allows plugin to communicate with own backend
 */
export interface PluginEndpointAPILayer extends InstanceAwareAPILayer {
  fetchApp: (
    relativeURL: string,
    requestParams: RequestParams & { scope?: boolean },
  ) => Promise<unknown>;
}

/*
 * This layer should repeat Custom Widgets API and be compatible with it.
 * It is needed to make it possible to use custom widgets as plugins with no or minimal changes.
 */
export interface CustomWidgetAPILayer extends PluginEndpointAPILayer {
  setTitle: (label: string, labelUrl: string) => void;
  setLoadingAnimationEnabled: (isEnabled: boolean) => void;

  enterConfigMode: () => void;
  exitConfigMode: () => void;

  setError: (e: Error) => void;
  clearError: () => void;

  readCache: () => Promise<unknown>;
  storeCache: (data: unknown) => Promise<void>;

  readConfig: () => Promise<unknown>;
  storeConfig: (config: unknown) => Promise<void>;

  downloadFile: (
    serviceID: string,
    relativeURL: string,
    requestParams: unknown,
    fileName?: string,
  ) => Promise<void>;
  fetchHub: (relativeURL: string, requestParams: RequestParams) => unknown;

  loadServices: (applicationName: string) => Promise<HubService[]>;

  alert: (...args: Parameters<(typeof AlertService)["addAlert"]>) => void;
  removeWidget: () => void;
}

export type AppLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export interface AppNavigation {
  getAppLocation: () => Promise<AppLocation>;
  updateAppLocation: (location: Partial<AppLocation>) => Promise<void>;
  replaceAppLocation: (location: Partial<AppLocation>) => Promise<void>;
}

export interface AppStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  getKeys: () => Promise<string[]>;
}

export interface FullPageAPILayer extends PluginEndpointAPILayer {
  /** Only for full-page extension points such as MAIN_MENU_ITEM. */
  navigation?: AppNavigation;
  /** Browser-local app storage; available since YouTrack 2026.2. */
  storage?: AppStorage;
}

export type HostAPI = FullPageAPILayer;

type YTAppInterface = {
  locale: string;
  me?: {
    id: string;
    login: string;
    name: string;
    avatarUrl?: string;
  };
  entity?: {
    id: string;
    type: "user" | "article" | "ticket" | "project" | "app";
  };
  register: (appApi?: AppAPI) => Promise<HostAPI | CustomWidgetAPILayer>;
};

declare global {
  const YTApp: YTAppInterface;
}

declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

