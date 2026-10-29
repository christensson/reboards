import type {YtAgile, YtSprint} from '@/common/youtrack/types';

/** An agile board only its owner can see: not shared with project members, groups or users. */
export const isPersonalAgile = (agile: YtAgile): boolean => {
  const sharing = agile.readSharingSettings;
  return Boolean(sharing) && !sharing?.projectBased && (sharing?.permittedGroups ?? []).length === 0 && (sharing?.permittedUsers ?? []).length === 0;
};

/** Sprints as sprint values: the name as key and label, start and finish as the date range. */
export const sprintValues = (sprints: YtSprint[]) =>
  sprints
    .filter(sprint => !sprint.archived)
    .map((sprint, index) => ({
      key: sprint.name,
      label: sprint.name,
      ordinal: index,
      ...(typeof sprint.start === 'number' ? {startDate: sprint.start} : {}),
      ...(typeof sprint.finish === 'number' ? {releaseDate: sprint.finish} : {})
    }));

export {boardSearchField} from '@/common/youtrack/query';
