

/**
 * Global storage extension properties for the app
 */
export interface AppGlobalStorageExtensionProperties {
  boards?: string;
}

/**
 * Map of entity types to their extended versions
 * Extended types have extension properties, others are 'never'
 */
export type ExtendedProperties = {
  Issue: never;
  Project: never;
  Article: never;
  User: never;
  AppGlobalStorage: AppGlobalStorageExtensionProperties;
};