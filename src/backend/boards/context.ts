import * as search from '@jetbrains/youtrack-scripting-api/search';
import type {Issue, User} from '@jetbrains/youtrack-scripting-api/entities';
import {baseUrlFromIssueUrl} from './url';

/** The search stub types its result as a plain ES Set; at runtime it is a YouTrack Set. */
type IssueSet = {
  isEmpty: () => boolean;
  first: () => Issue | null;
};

/**
 * Resolves the base URL of this YouTrack installation on behalf of the user.
 * Returns null when the user cannot see any issue (nothing to derive the URL from).
 */
export const resolveBaseUrl = (user: User): string | null => {
  try {
    const issues = search.search(null, 'sort by: created desc', user) as unknown as IssueSet;
    if (issues.isEmpty()) {
      return null;
    }
    const first = issues.first();
    return first ? baseUrlFromIssueUrl(first.url) : null;
  } catch (error) {
    console.warn('[sprinter] Could not resolve the base URL', error);
    return null;
  }
};
