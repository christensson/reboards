import type {UniverseValue} from './fieldUniverse';

const DAY_MS = 86_400_000;

/** Sprint dates are calendar days, stored at noon UTC, so their UTC day is the date. */
const sprintDay = (timestamp: number): number => Math.floor(timestamp / DAY_MS);

/** Today's calendar date for the viewer, on the same day scale as `sprintDay`. */
const today = (now: number): number => {
  const local = new Date(now);
  return sprintDay(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
};

/** The sprint runs today: both its first and its last day count. */
export const isCurrentSprint = (value: UniverseValue, now: number): boolean => {
  if (value.startDate === undefined || value.releaseDate === undefined) {
    return false;
  }
  const day = today(now);
  return sprintDay(value.startDate) <= day && day <= sprintDay(value.releaseDate);
};

/** Date used to order a sprint: its start, else its end; undefined for undated sprints. */
const sortDate = (value: UniverseValue): number | undefined => value.startDate ?? value.releaseDate;

/** Newest sprint first by start date (end date when there is no start); undated sprints keep their order at the end. */
export const sortSprintsByDate = (values: UniverseValue[]): UniverseValue[] =>
  values
    .map((value, index) => ({value, index, date: sortDate(value)}))
    .sort((a, b) => {
      if (a.date === undefined && b.date === undefined) {
        return a.index - b.index;
      }
      if (a.date === undefined || b.date === undefined) {
        return a.date === undefined ? 1 : -1;
      }
      return b.date - a.date || (b.value.releaseDate ?? 0) - (a.value.releaseDate ?? 0) || a.index - b.index;
    })
    .map(entry => entry.value);

/** The sprints running today, newest first. */
export const currentSprints = (values: UniverseValue[], now: number): UniverseValue[] =>
  sortSprintsByDate(values.filter(value => isCurrentSprint(value, now)));

/** Key of the sprint running today; the latest-starting one wins when ranges overlap. */
export const sprintForDate = (values: UniverseValue[], now: number): string | null => currentSprints(values, now)[0]?.key ?? null;

/** "2026-10-01 – 2026-10-14" in the given format, with an open end when one date is missing; undefined without dates. */
export const sprintDateRange = (value: UniverseValue, formatDate: (timestamp: number) => string): string | undefined => {
  const {startDate, releaseDate} = value;
  if (startDate === undefined && releaseDate === undefined) {
    return undefined;
  }
  const format = (date: number | undefined): string => (date === undefined ? '…' : formatDate(date));
  return `${format(startDate)} – ${format(releaseDate)}`;
};
