import {describe, expect, it} from 'vitest';
import {boardSearchField, isPersonalAgile, sprintValues} from './agileSource';

describe('agile source helpers', () => {
  it('counts a board shared with nobody as personal', () => {
    const base = {id: '1', name: 'Mine'};
    expect(isPersonalAgile({...base, readSharingSettings: {projectBased: false, permittedGroups: [], permittedUsers: []}})).toBe(true);
    expect(isPersonalAgile({...base, readSharingSettings: {projectBased: true, permittedGroups: [], permittedUsers: []}})).toBe(false);
    expect(isPersonalAgile({...base, readSharingSettings: {projectBased: false, permittedGroups: [{id: 'g'}], permittedUsers: []}})).toBe(false);
  });

  it('turns sprints into sprint values with their dates, leaving out archived ones', () => {
    expect(sprintValues([{id: '1', name: 'S1', start: 10, finish: 20}, {id: '2', name: 'Old', archived: true}, {id: '3', name: 'S2', start: null}]))
      .toEqual([{key: 'S1', label: 'S1', ordinal: 0, startDate: 10, releaseDate: 20}, {key: 'S2', label: 'S2', ordinal: 1}]);
    expect(boardSearchField('sandbox Board')).toBe('Board sandbox Board');
  });
});
