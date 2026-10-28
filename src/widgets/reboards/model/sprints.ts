import type {UniverseValue} from './fieldUniverse';

/** Key of the sprint whose date range contains `now`; the latest-starting one wins when ranges overlap. */
export const sprintForDate = (values: UniverseValue[], now: number): string | null => {
  const matching = values.filter(
    v => v.startDate !== undefined && v.releaseDate !== undefined && v.startDate <= now && now <= v.releaseDate
  );
  matching.sort((a, b) => (b.startDate ?? 0) - (a.startDate ?? 0));
  return matching[0]?.key ?? null;
};
