import {useEffect, useState} from 'react';
import {formatWithPattern, toLanguageTag} from '@/common/youtrack/dateFormat';
import {youtrack} from './api';

/** Formats a calendar date (a timestamp whose UTC day is the date). */
export type DateFormatter = (timestamp: number) => string;

// Used until the profile is loaded, or when it has no pattern.
const fallbackFormat = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'});
const fallback: DateFormatter = timestamp => fallbackFormat.format(timestamp);

let loaded: Promise<DateFormatter> | null = null;

const loadFormatter = (): Promise<DateFormatter> => {
  loaded ??= youtrack
    .getMyGeneralProfile()
    .then(profile => {
      const pattern = profile.dateFieldFormat?.datePattern;
      const locale = toLanguageTag(profile.locale?.locale);
      return pattern ? (timestamp: number) => formatWithPattern(timestamp, pattern, locale) : fallback;
    })
    .catch(() => fallback);
  return loaded;
};

/** The date format chosen in the user's YouTrack profile; loaded once per page. */
export const useDateFormat = (): DateFormatter => {
  const [format, setFormat] = useState<DateFormatter>(() => fallback);
  useEffect(() => {
    let cancelled = false;
    loadFormatter().then(loadedFormat => {
      if (!cancelled) {
        setFormat(() => loadedFormat);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return format;
};
