import {describe, expect, it} from 'vitest';
import {issueUrl, newIssueUrl} from './urls';
import {resolveBaseUrl} from './host-url';

describe('urls', () => {
  it('builds issue urls', () => {
    expect(issueUrl('https://yt.example.com', 'DEMO-12')).toBe('https://yt.example.com/issue/DEMO-12');
  });

  it('builds new-issue template urls with field presets', () => {
    const url = newIssueUrl('https://yt.example.com/youtrack', 'SP', [
      {field: 'Priority', value: 'Major'},
      {field: 'State2', value: 'In Progress'},
      {field: 'Story points', value: ''}
    ]);
    expect(url).toBe('https://yt.example.com/youtrack/newIssue?project=SP&c=Priority+Major&c=State2+In%20Progress');
  });

  it('appends raw commands with words joined by plus', () => {
    expect(newIssueUrl('b', 'SP', [{field: 'State', value: 'Open'}], ['subtask of SP-12'])).toBe(
      'b/newIssue?project=SP&c=State+Open&c=subtask+of+SP-12'
    );
  });

  it('keeps a literal plus inside values encoded', () => {
    expect(newIssueUrl('b', 'P', [{field: 'A+B', value: 'C+D'}])).toBe('b/newIssue?project=P&c=A%2BB+C%2BD');
  });
});

describe('resolveBaseUrl', () => {
  it('takes the part before /api/ from the widget url', () => {
    expect(resolveBaseUrl('https://h.test/youtrack/api/apps/1/widgets/x/index.html', '', 'https://h.test'))
      .toBe('https://h.test/youtrack');
  });

  it('falls back to the referrer page', () => {
    expect(resolveBaseUrl('https://cdn.test/widget.html', 'https://h.test/youtrack/app/sprinter/boards/1?x=1', 'https://cdn.test'))
      .toBe('https://h.test/youtrack');
    expect(resolveBaseUrl('about:blank', 'https://h.test/issues', 'x')).toBe('https://h.test');
  });

  it('falls back to the origin', () => {
    expect(resolveBaseUrl('about:blank', '', 'https://h.test/')).toBe('https://h.test');
  });
});
