/**
 * Formats dates with the user's YouTrack date pattern. YouTrack exposes it as a
 * Java SimpleDateFormat pattern (`yyyy-MM-dd`, `dd.MM.yyyy`, `MMM d, yyyy`...);
 * the letters a date needs are supported, others stay literal.
 */

/** Year, month and day letters plus weekday; time letters never appear in a date pattern. */
const TOKEN = /'([^']*)'|''|y+|M+|d+|E+/g;

/** Pattern letter counts: 2 → two-digit year, 3 → short name, 4 or more → full name. */
const TWO_DIGITS = 2;
const SHORT_NAME = 3;
const FULL_NAME = 4;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

const name = (date: Date, locale: string | undefined, option: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(locale, {...option, timeZone: 'UTC'}).format(date);

const formatToken = (token: string, date: Date, locale: string | undefined): string => {
  const length = token.length;
  switch (token[0]) {
    case 'y':
      return length === TWO_DIGITS ? pad(date.getUTCFullYear() % 100, TWO_DIGITS) : pad(date.getUTCFullYear(), length);
    case 'M':
      if (length >= FULL_NAME) {
        return name(date, locale, {month: 'long'});
      }
      return length === SHORT_NAME ? name(date, locale, {month: 'short'}) : pad(date.getUTCMonth() + 1, length);
    case 'd':
      return pad(date.getUTCDate(), length);
    default:
      return name(date, locale, {weekday: length >= FULL_NAME ? 'long' : 'short'});
  }
};

/**
 * Formats a calendar date in UTC with a Java date pattern. `locale` is a BCP 47
 * tag for month and weekday names.
 */
export const formatWithPattern = (timestamp: number, pattern: string, locale?: string): string => {
  const date = new Date(timestamp);
  return pattern.replace(TOKEN, (token, quoted: string | undefined) => {
    if (token === "''") {
      return "'";
    }
    if (quoted !== undefined) {
      return quoted;
    }
    return formatToken(token, date, locale);
  });
};

/** YouTrack locale ids use underscores (`en_US`); Intl wants `en-US`. */
export const toLanguageTag = (locale: string | undefined): string | undefined => locale?.replace('_', '-') || undefined;
