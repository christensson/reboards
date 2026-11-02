import {youtrackBaseUrl} from '@/common/youtrack/host';

let resolved: string | null = null;

/** Base URL of this YouTrack installation, derived from the widget's own URL without any request. */
export const useBaseUrl = (): string => {
  resolved ??= youtrackBaseUrl();
  return resolved;
};
