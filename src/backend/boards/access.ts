import * as entities from '@jetbrains/youtrack-scripting-api/entities';
import type {User} from '@jetbrains/youtrack-scripting-api/entities';
import type {ProjectRef} from '@/common/model/board-config';
import type {ProjectAccess} from './store';

/** Permission a user needs in every project of a shared board to see that board. */
export const PROJECT_READ_PERMISSION = 'READ_ISSUE';

/**
 * Checks project access on behalf of the user, memoized per call so a request
 * looks each project up once. Unknown projects (deleted, or renamed since the
 * board was saved) count as inaccessible.
 */
export const projectAccessFor = (user: User): ProjectAccess => {
  const cache = new Map<string, boolean>();
  return (project: ProjectRef) => {
    const cached = cache.get(project.shortName);
    if (cached !== undefined) {
      return cached;
    }
    let readable = false;
    try {
      const found = entities.Project.findByKey(project.shortName);
      readable = Boolean(found) && user.hasPermission(PROJECT_READ_PERMISSION, found);
    } catch (error) {
      console.warn(`[reboards] Could not check access to project ${project.shortName}`, error);
    }
    cache.set(project.shortName, readable);
    return readable;
  };
};
