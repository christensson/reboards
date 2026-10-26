/** Derives the YouTrack base URL from the absolute URL of an issue, e.g. https://host/youtrack/issue/SP-1. */
export const baseUrlFromIssueUrl = (issueUrl: string): string | null => {
  const match = issueUrl.match(/^(https?:\/\/.*)\/issue\/[^/?#]+/);
  return match ? match[1] : null;
};
