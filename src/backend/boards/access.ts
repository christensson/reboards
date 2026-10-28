import * as entities from '@jetbrains/youtrack-scripting-api/entities';
import type {User} from '@jetbrains/youtrack-scripting-api/entities';
import type {ProjectRef} from '@/common/model/board-config';
import type {ProjectAccess} from './store';

/** Permission a user needs in every project of a shared board to see that board. */
export const PROJECT_READ_PERMISSION = 'READ_ISSUE';

/** Permission that makes a user a project admin: they may share and delete boards of that project. */
export const PROJECT_ADMIN_PERMISSION = 'UPDATE_PROJECT';

/**
 * Checks a project permission on behalf of the user, memoized per call so a
 * request looks each project up once. Unknown projects (deleted, or renamed
 * since the board was saved) never grant it.
 */
const projectPermissionFor = (user: User, permission: string): ProjectAccess => {
  const cache = new Map<string, boolean>();
  return (project: ProjectRef) => {
    const cached = cache.get(project.shortName);
    if (cached !== undefined) {
      return cached;
    }
    let granted = false;
    try {
      const found = entities.Project.findByKey(project.shortName);
      granted = Boolean(found) && user.hasPermission(permission, found);
    } catch (error) {
      console.warn(`[reboards] Could not check ${permission} in project ${project.shortName}`, error);
    }
    cache.set(project.shortName, granted);
    return granted;
  };
};

export const projectAccessFor = (user: User): ProjectAccess => projectPermissionFor(user, PROJECT_READ_PERMISSION);

export const projectAdminFor = (user: User): ProjectAccess => projectPermissionFor(user, PROJECT_ADMIN_PERMISSION);
