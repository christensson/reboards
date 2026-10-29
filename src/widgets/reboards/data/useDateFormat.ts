import {useEffect, useState} from 'react';
import {formatWithPattern, toLanguageTag} from '@/common/youtrack/dateFormat';
import {youtrack} from './api';

/** Formats a calendar date (a timestamp whose UTC day is the date). */
export type DateFormatter = (timestamp: number) => string;

type Formats = {date: DateFormatter; dateTime: DateFormatter};

// Used until the profile is loaded, or when it has no pattern.
const fallbackDate = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'});
const fallbackDateTime = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
const fallback: Formats = {date: timestamp => fallbackDate.format(timestamp), dateTime: timestamp => fallbackDateTime.format(timestamp)};

let loaded: Promise<Formats> | null = null;

const loadFormats = (): Promise<Formats> => {
  loaded ??= youtrack
    .getMyGeneralProfile()
    .then(profile => {
      const {datePattern, pattern} = profile.dateFieldFormat ?? {};
      const locale = toLanguageTag(profile.locale?.locale);
      return {
        date: datePattern ? (timestamp: number) => formatWithPattern(timestamp, datePattern, locale) : fallback.date,
        // A date with a time of day is shown in the user's own time zone.
        dateTime: pattern ? (timestamp: number) => formatWithPattern(timestamp, pattern, locale, true) : fallback.dateTime
      };
    })
    .catch(() => fallback);
  return loaded;
};

const useFormats = (): Formats => {
  const [formats, setFormats] = useState<Formats>(fallback);
  useEffect(() => {
    let cancelled = false;
    loadFormats().then(loadedFormats => {
      if (!cancelled) {
        setFormats(loadedFormats);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return formats;
};

/** The date format chosen in the user's YouTrack profile; loaded once per page. */
export const useDateFormat = (): DateFormatter => useFormats().date;

/** The date and time format of the user's YouTrack profile, in the user's time zone. */
export const useDateTimeFormat = (): DateFormatter => useFormats().dateTime;
