import type { User } from '@jetbrains/youtrack-workflow-types/workflowTypeScriptStubs';

/**
 * App-specific extension properties for User
 */
export type UserExtensionProperties = {
  boards?: string;
};

/**
 * Extended User with app-specific extension properties
 */
export type ExtendedUser = Omit<User, 'extensionProperties'> & {
  extensionProperties: UserExtensionProperties;
};

/**
 * Global storage extension properties for the app
 */
export interface AppGlobalStorageExtensionProperties {
  boards?: string;
  boards00?: string;
  boards01?: string;
  boards02?: string;
  boards03?: string;
  boards04?: string;
  boards05?: string;
  boards06?: string;
  boards07?: string;
  boards08?: string;
  boards09?: string;
  boards10?: string;
  boards11?: string;
  boards12?: string;
  boards13?: string;
  boards14?: string;
  boards15?: string;
  boards16?: string;
  boards17?: string;
  boards18?: string;
  boards19?: string;
  boards20?: string;
  boards21?: string;
  boards22?: string;
  boards23?: string;
  boards24?: string;
  boards25?: string;
  boards26?: string;
  boards27?: string;
  boards28?: string;
  boards29?: string;
  boards30?: string;
  boards31?: string;
}

declare module '@jetbrains/youtrack-workflow-types/workflowTypeScriptStubs' {
  interface ExtensionPropertiesRegistry {
    User: UserExtensionProperties;
  }
}

/**
 * Map of entity types to their extended versions
 * Extended types have extension properties, others are 'never'
 */
export type ExtendedProperties = {
  Issue: never;
  Project: never;
  Article: never;
  User: ExtendedUser;
  AppGlobalStorage: AppGlobalStorageExtensionProperties;
};