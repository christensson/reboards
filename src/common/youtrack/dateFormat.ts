/**
 * Formats dates with the user's YouTrack date pattern. YouTrack exposes it as a
 * Java SimpleDateFormat pattern (`yyyy-MM-dd`, `dd.MM.yyyy`, `MMM d, yyyy`...);
 * the letters a date needs are supported, others stay literal.
 */

/** Year, month, day and weekday letters, plus the time letters of a date and time pattern. */
const TOKEN = /'([^']*)'|''|y+|M+|d+|E+|H+|h+|m+|s+|a+/g;

/** Pattern letter counts: 2 → two-digit year, 3 → short name, 4 or more → full name. */
const TWO_DIGITS = 2;
const SHORT_NAME = 3;
const FULL_NAME = 4;
const HALF_DAY = 12;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

/** Parts of a date, read in UTC (calendar dates) or in local time (dates with a time of day). */
type Parts = {year: number; month: number; day: number; hours: number; minutes: number; seconds: number};

const partsOf = (date: Date, local: boolean): Parts =>
  local
    ? {year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hours: date.getHours(), minutes: date.getMinutes(), seconds: date.getSeconds()}
    : {year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hours: date.getUTCHours(), minutes: date.getUTCMinutes(), seconds: date.getUTCSeconds()};

const name = (date: Date, locale: string | undefined, local: boolean, option: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(locale, {...option, ...(local ? {} : {timeZone: 'UTC'})}).format(date);

const formatTime = (token: string, parts: Parts): string => {
  const length = token.length;
  switch (token[0]) {
    case 'H':
      return pad(parts.hours, length);
    case 'h':
      return pad(parts.hours % HALF_DAY || HALF_DAY, length);
    case 'm':
      return pad(parts.minutes, length);
    case 's':
      return pad(parts.seconds, length);
    default:
      return parts.hours < HALF_DAY ? 'AM' : 'PM';
  }
};

const formatToken = (token: string, date: Date, locale: string | undefined, local: boolean): string => {
  const length = token.length;
  const parts = partsOf(date, local);
  switch (token[0]) {
    case 'y':
      return length === TWO_DIGITS ? pad(parts.year % 100, TWO_DIGITS) : pad(parts.year, length);
    case 'M':
      if (length >= FULL_NAME) {
        return name(date, locale, local, {month: 'long'});
      }
      return length === SHORT_NAME ? name(date, locale, local, {month: 'short'}) : pad(parts.month + 1, length);
    case 'd':
      return pad(parts.day, length);
    case 'E':
      return name(date, locale, local, {weekday: length >= FULL_NAME ? 'long' : 'short'});
    default:
      return formatTime(token, parts);
  }
};

/**
 * Formats a date with a Java date pattern. Calendar dates are read in UTC, the day they are
 * stored on; with `local`, the date and time of day are the user's local ones. `locale` is a
 * BCP 47 tag for month and weekday names.
 */
export const formatWithPattern = (timestamp: number, pattern: string, locale?: string, local = false): string => {
  const date = new Date(timestamp);
  return pattern.replace(TOKEN, (token, quoted: string | undefined) => {
    if (token === "''") {
      return "'";
    }
    if (quoted !== undefined) {
      return quoted;
    }
    return formatToken(token, date, locale, local);
  });
};

/** YouTrack locale ids use underscores (`en_US`); Intl wants `en-US`. */
export const toLanguageTag = (locale: string | undefined): string | undefined => locale?.replace('_', '-') || undefined;
