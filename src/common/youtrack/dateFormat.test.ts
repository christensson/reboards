import {describe, expect, it} from 'vitest';
import {formatWithPattern, toLanguageTag} from './dateFormat';

const date = Date.UTC(2026, 9, 5, 12);

describe('formatWithPattern', () => {
  it('formats numeric patterns', () => {
    expect(formatWithPattern(date, 'yyyy-MM-dd')).toBe('2026-10-05');
    expect(formatWithPattern(date, 'dd.MM.yyyy')).toBe('05.10.2026');
    expect(formatWithPattern(date, 'M/d/yy')).toBe('10/5/26');
  });

  it('uses month and weekday names of the locale', () => {
    expect(formatWithPattern(date, 'MMM d, yyyy', 'en-US')).toBe('Oct 5, 2026');
    expect(formatWithPattern(date, 'EEEE d MMMM', 'en-US')).toBe('Monday 5 October');
  });

  it('covers the date formats offered in the YouTrack profile', () => {
    const end = Date.UTC(2000, 11, 31, 12);
    expect(formatWithPattern(end, 'dd/MM/yyyy')).toBe('31/12/2000');
    expect(formatWithPattern(end, 'MM/dd/yyyy')).toBe('12/31/2000');
    expect(formatWithPattern(end, 'dd MMM yyyy', 'en-US')).toBe('31 Dec 2000');
    expect(formatWithPattern(end, 'dd MMMM yyyy', 'en-US')).toBe('31 December 2000');
    expect(formatWithPattern(end, 'yyyy-MM-dd')).toBe('2000-12-31');
  });

  it('keeps quoted text and other characters literal', () => {
    expect(formatWithPattern(date, "d 'of' MMM", 'en-US')).toBe('5 of Oct');
    expect(formatWithPattern(date, "yyyy''MM")).toBe("2026'10");
  });
});

describe('toLanguageTag', () => {
  it('turns YouTrack locale ids into BCP 47 tags', () => {
    expect(toLanguageTag('en_US')).toBe('en-US');
    expect(toLanguageTag(undefined)).toBeUndefined();
  });
});

describe('formatWithPattern with a time of day', () => {
  it('formats hours and minutes in local time', () => {
    const time = new Date(2026, 4, 10, 14, 5).getTime();
    expect(formatWithPattern(time, 'yyyy-MM-dd HH:mm', 'en', true)).toBe('2026-05-10 14:05');
    expect(formatWithPattern(time, 'h:mm a', 'en', true)).toBe('2:05 PM');
  });
});
