import {describe, expect, it} from 'vitest';
import {baseUrlFromIssueUrl} from './url';

describe('baseUrlFromIssueUrl', () => {
  it('strips the issue path', () => {
    expect(baseUrlFromIssueUrl('https://mch.youtrack.cloud/issue/SP-1')).toBe('https://mch.youtrack.cloud');
    expect(baseUrlFromIssueUrl('https://host.example.com/youtrack/issue/ABC-123')).toBe('https://host.example.com/youtrack');
    expect(baseUrlFromIssueUrl('not a url')).toBeNull();
  });
});
