export type FieldPreset = {
  field: string;
  value: string;
};

export const issueUrl = (baseUrl: string, idReadable: string): string =>
  `${baseUrl}/issue/${encodeURIComponent(idReadable)}`;

/**
 * Builds a YouTrack "issue template" URL: <base>/newIssue?project=X&c=Field+Value&c=...&c=command+words
 * Field and value are percent-encoded separately so the literal "+" stays the separator.
 */
export const newIssueUrl = (baseUrl: string, projectShortName: string, presets: FieldPreset[], commands: string[] = []): string => {
  const params = [`project=${encodeURIComponent(projectShortName)}`];
  presets
    .filter(p => p.field && p.value)
    .forEach(p => params.push(`c=${encodeURIComponent(p.field)}+${encodeURIComponent(p.value)}`));
  // Raw commands such as "subtask of SP-12": words percent-encoded, joined by a literal "+".
  commands
    .map(command => command.split(/\s+/u).filter(Boolean))
    .filter(words => words.length > 0)
    .forEach(words => params.push(`c=${words.map(encodeURIComponent).join('+')}`));
  return `${baseUrl}/newIssue?${params.join('&')}`;
};
