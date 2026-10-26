import type { ExtendedAppGlobalStorage, AppGlobalStorageExtensionProperties } from './extended-entities.js';



/**
 * Extended global context with app-specific global storage extension properties
 */
export type ExtendedGlobalCtx<T extends import('@jetbrains/youtrack-apps-tools/dx').GlobalCtx> =
  Omit<T, 'globalStorage'> & {
    globalStorage: {
      extensionProperties: AppGlobalStorageExtensionProperties;
    };
  };
