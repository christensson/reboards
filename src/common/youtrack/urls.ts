export type FieldPreset = {
  field: string;
  value: string;
};

export const issueUrl = (baseUrl: string, idReadable: string): string =>
  `${baseUrl}/issue/${encodeURIComponent(idReadable)}`;

/**
 * Builds a YouTrack "issue template" URL: <base>/newIssue?project=X&c=Field+Value&c=...
 * Field and value are percent-encoded separately so the literal "+" stays the separator.
 */
export const newIssueUrl = (baseUrl: string, projectShortName: string, presets: FieldPreset[]): string => {
  const params = [`project=${encodeURIComponent(projectShortName)}`];
  presets
    .filter(p => p.field && p.value)
    .forEach(p => params.push(`c=${encodeURIComponent(p.field)}+${encodeURIComponent(p.value)}`));
  return `${baseUrl}/newIssue?${params.join('&')}`;
};
