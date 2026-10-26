import {describe, expect, it} from 'vitest';
import {buildFieldUpdate, describeFieldType, toFieldValue} from './fields';

describe('describeFieldType', () => {
  it('classifies known field types', () => {
    expect(describeFieldType('enum[1]')).toEqual({kind: 'enum', multi: false});
    expect(describeFieldType('enum[*]')).toEqual({kind: 'enum', multi: true});
    expect(describeFieldType('state[1]')).toEqual({kind: 'state', multi: false});
    expect(describeFieldType('version[*]')).toEqual({kind: 'version', multi: true});
    expect(describeFieldType('user[1]')).toEqual({kind: 'user', multi: false});
    expect(describeFieldType('integer')).toEqual({kind: 'integer', multi: false});
    expect(describeFieldType('ownedField[1]')).toEqual({kind: 'enum', multi: false});
  });

  it('marks unsupported types as other', () => {
    expect(describeFieldType('string')).toEqual({kind: 'other', multi: false});
    expect(describeFieldType('date')).toEqual({kind: 'other', multi: false});
    expect(describeFieldType('period').kind).toBe('other');
  });
});

describe('toFieldValue', () => {
  it('handles enum, state, user, number and multi values', () => {
    expect(toFieldValue({id: '1', name: 'Priority', $type: 'SingleEnumIssueCustomField', value: {name: 'Major', color: {background: '#f', foreground: '#0'}}}))
      .toEqual({$type: 'SingleEnumIssueCustomField', key: 'Major', label: 'Major', color: {background: '#f', foreground: '#0'}, labels: ['Major']});
    expect(toFieldValue({id: '1', name: 'State', $type: 'StateIssueCustomField', value: {name: 'Done', isResolved: true}}))
      .toMatchObject({key: 'Done', isResolved: true});
    expect(toFieldValue({id: '1', name: 'Assignee', $type: 'SingleUserIssueCustomField', value: {login: 'jdoe', fullName: 'John Doe', avatarUrl: '/a'}}))
      .toEqual({$type: 'SingleUserIssueCustomField', key: 'jdoe', label: 'John Doe', avatarUrl: '/a', labels: ['John Doe']});
    expect(toFieldValue({id: '1', name: 'Story points', $type: 'SimpleIssueCustomField', value: 5}))
      .toEqual({$type: 'SimpleIssueCustomField', key: '5', label: '5', labels: ['5']});
    expect(toFieldValue({id: '1', name: 'Sprints', $type: 'MultiVersionIssueCustomField', value: [{name: 'Sprint 1'}, {name: 'Sprint 2'}]}))
      .toMatchObject({key: 'Sprint 1', labels: ['Sprint 1', 'Sprint 2']});
  });

  it('returns null for unset values', () => {
    expect(toFieldValue({id: '1', name: 'Assignee', $type: 'SingleUserIssueCustomField', value: null})).toBeNull();
    expect(toFieldValue({id: '1', name: 'Sprints', $type: 'MultiVersionIssueCustomField', value: []})).toBeNull();
  });
});

describe('buildFieldUpdate', () => {
  it('builds bodies per kind', () => {
    expect(buildFieldUpdate('State', 'state', 'StateIssueCustomField', 'Done')).toEqual({name: 'State', $type: 'StateIssueCustomField', value: {name: 'Done'}});
    expect(buildFieldUpdate('Assignee', 'user', undefined, 'jdoe')).toEqual({name: 'Assignee', $type: 'SingleUserIssueCustomField', value: {login: 'jdoe'}});
    expect(buildFieldUpdate('Story points', 'integer', undefined, '3')).toEqual({name: 'Story points', $type: 'SimpleIssueCustomField', value: 3});
    expect(buildFieldUpdate('Priority', 'enum', undefined, null)).toEqual({name: 'Priority', $type: 'SingleEnumIssueCustomField', value: null});
  });
});
