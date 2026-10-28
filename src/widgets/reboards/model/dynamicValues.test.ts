import {describe, expect, it} from 'vitest';
import {type DynamicOptions, defaultDynamicOptions} from '@/common/model/board-config';
import type {FieldValue} from '@/common/youtrack/fields';
import type {ResolvedField} from './fieldUniverse';
import type {BoardIssue} from './issue';
import {choosableValues, dynamicValues, shownKeys, sortDynamicValues} from './dynamicValues';

const versions: ResolvedField = {
  name: 'Fix versions',
  kind: 'version',
  multi: true,
  typeId: 'version[*]',
  projectsCount: 1,
  inconsistent: false,
  canBeEmpty: true,
  values: [
    {key: 'v1', label: 'v1', ordinal: 0, releaseDate: 100, released: true},
    {key: 'v2', label: 'v2', ordinal: 1, releaseDate: 300},
    {key: 'v0', label: 'v0', ordinal: 2, releaseDate: 50, released: true, archived: true},
    {key: 'next', label: 'next', ordinal: 3}
  ]
};

const value = (keys: string[]): FieldValue => ({$type: 'MultiVersionIssueCustomField', key: keys[0], label: keys[0], labels: keys, keys});

const issue = (id: string, keys: string[] | null): BoardIssue => ({
  id, idReadable: `SAN-${id}`, summary: id, projectId: 'p', projectShortName: 'SAN', number: Number(id), tags: [], links: [], parentIds: [], childIds: [],
  fields: {'Fix versions': keys ? value(keys) : null}
});

const options = (changes: Partial<DynamicOptions> = {}): DynamicOptions => ({...defaultDynamicOptions(), ...changes});

describe('dynamicValues', () => {
  const issues = [issue('1', ['v1', 'v2']), issue('2', ['v2']), issue('3', null), issue('4', ['v0'])];

  it('collects the values the issues carry, counting every value of multi-value fields', () => {
    const result = dynamicValues('Fix versions', versions, issues, options());
    expect(result.values.map(v => [v.key, v.count])).toEqual([['v1', 1], ['v2', 2]]);
    // Issue 4 only has an archived version, which is hidden by default: it counts as empty.
    expect(result.emptyCount).toBe(2);
  });

  it('filters released and archived versions per the options', () => {
    expect(dynamicValues('Fix versions', versions, issues, options({showReleased: false})).values.map(v => v.key)).toEqual(['v2']);
    expect(dynamicValues('Fix versions', versions, issues, options({showArchived: true})).values.map(v => v.key)).toEqual(['v0', 'v1', 'v2']);
    expect(shownKeys(issue('5', ['v0', 'v2']), 'Fix versions', versions, options())).toEqual(['v2']);
  });

  it('sorts by date with undated values last, either way', () => {
    const values = [{key: 'next', label: 'next', count: 1}, {key: 'v2', label: 'v2', count: 1, date: 300}, {key: 'v1', label: 'v1', count: 1, date: 100}];
    expect(sortDynamicValues(values, 'date').map(v => v.key)).toEqual(['v1', 'v2', 'next']);
    expect(sortDynamicValues(values, 'date-desc').map(v => v.key)).toEqual(['v2', 'v1', 'next']);
    expect(sortDynamicValues(values, 'alphabetical-desc').map(v => v.key)).toEqual(['v2', 'v1', 'next']);
  });
});

describe('choosableValues', () => {
  it('offers every shown value of the field, also those no issue has, sorted per the options', () => {
    const values = choosableValues('Fix versions', versions, [issue('1', ['v2'])], options({sort: 'date-desc'}));
    expect(values.map(v => [v.key, v.count])).toEqual([['v2', 1], ['v1', 0], ['next', 0]]);
    expect(choosableValues('Fix versions', versions, [], options({showReleased: false})).map(v => v.key)).toEqual(['next', 'v2']);
  });
});
