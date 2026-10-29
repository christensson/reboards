/** Minimal YouTrack REST DTOs used by ReBoards (shapes verified against YouTrack 2026.2). */

export type YtColor = {
  background: string;
  foreground: string;
};

export type YtProject = {
  id: string;
  shortName: string;
  name: string;
};

export type YtFieldType = {
  id: string;
  valueType: string;
};

/** The parts of the user's general profile that decide how dates are shown. */
export type YtGeneralProfile = {
  /** `datePattern` for dates, `pattern` for dates with a time of day. */
  dateFieldFormat?: {datePattern?: string; pattern?: string};
  locale?: {locale?: string};
};

export type YtBundleValue = {
  id: string;
  name: string;
  ordinal?: number;
  /** Version values only: sprint start and release dates in epoch milliseconds. */
  startDate?: number | null;
  releaseDate?: number | null;
  /** Version values only. */
  released?: boolean;
  archived?: boolean;
  /** Build values only: assembly date in epoch milliseconds. */
  assembleDate?: number | null;
  isResolved?: boolean;
  color?: YtColor | null;
};

export type YtUser = {
  id: string;
  login: string;
  fullName: string;
  avatarUrl?: string;
  banned?: boolean;
};

export type YtBundle = {
  id: string;
  $type: string;
  values?: YtBundleValue[];
  aggregatedUsers?: YtUser[];
};

export type YtProjectCustomField = {
  id: string;
  $type: string;
  field: {id: string; name: string; fieldType: YtFieldType};
  bundle?: YtBundle | null;
  /** False when the field always has a value in this project. */
  canBeEmpty?: boolean;
};

export type YtIssueLinkType = {
  id: string;
  name: string;
  sourceToTarget: string;
  targetToSource: string;
  directed: boolean;
  aggregation: boolean;
};

export type YtLinkDirection = 'OUTWARD' | 'INWARD' | 'BOTH';

export type YtIssueLink = {
  id: string;
  direction: YtLinkDirection;
  linkType: YtIssueLinkType;
  issues: {id: string; idReadable: string}[];
};

export type YtFieldValueObject = {
  $type?: string;
  id?: string;
  name?: string;
  login?: string;
  fullName?: string;
  avatarUrl?: string;
  presentation?: string;
  color?: YtColor | null;
  isResolved?: boolean;
  /** Period values: the duration in minutes. */
  minutes?: number;
};

export type YtIssueCustomField = {
  id: string;
  name: string;
  $type: string;
  value: YtFieldValueObject | YtFieldValueObject[] | number | string | null;
};

export type YtTag = {
  id: string;
  name: string;
  color?: YtColor | null;
};

export type YtIssue = {
  id: string;
  idReadable: string;
  summary: string;
  /** When the issue was resolved; null while it is unresolved. */
  resolved?: number | null;
  project: {id: string; shortName: string};
  tags: YtTag[];
  customFields: YtIssueCustomField[];
  links: YtIssueLink[];
};

export type YtStyleRange = {
  start: number;
  length: number;
  style: string;
};

export type YtSuggestion = {
  prefix: string | null;
  option: string;
  suffix: string | null;
  description: string | null;
  matchingStart: number;
  matchingEnd: number;
  caret: number;
  completionStart: number;
  completionEnd: number;
  group: string | null;
  icon: string | null;
};

export type YtSearchAssist = {
  query: string;
  caret: number;
  styleRanges: YtStyleRange[];
  suggestions: YtSuggestion[];
};
