import React, {useMemo} from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import {ValuePill} from '@/common/components/ValuePill';
import type {FieldRef} from '@/common/model/board-config';
import type {FieldUniverse, UniverseValue} from '../model/fieldUniverse';
import type {BoardIssue} from '../model/issue';
import {orderValues} from '../model/sorting';

type Props = {
  show: boolean;
  field: FieldRef | null;
  universe: FieldUniverse;
  /** Issues on the board, used to offer observed values of user and integer fields. */
  issues: BoardIssue[];
  subjectLabel: string;
  onPick: (valueKey: string | null) => void;
  onCancel: () => void;
};

/** Asks which second-level swimlane value to set after a drop on an "Assign other swimlane" row. */
export const SwimlanePickerDialog: React.FC<Props> = ({show, field, universe, issues, subjectLabel, onPick, onCancel}) => {
  const values = useMemo<UniverseValue[]>(() => {
    if (!field) {
      return [];
    }
    const known = new Map<string, UniverseValue>();
    (universe.byName.get(field.name)?.values ?? []).forEach(v => known.set(v.key, v));
    issues.forEach(issue => {
      const value = issue.fields[field.name];
      if (value && !known.has(value.key)) {
        known.set(value.key, {key: value.key, label: value.label, ordinal: known.size, color: value.color, avatarUrl: value.avatarUrl});
      }
    });
    return orderValues(Array.from(known.values()), 'custom', []);
  }, [field, universe, issues]);

  return (
    <Dialog show={show} onCloseAttempt={onCancel} label="Choose a swimlane" trapFocus>
      <Header>{`Set ${field?.name ?? 'swimlane'} for ${subjectLabel}`}</Header>
      <Content>
        <p className="value-picker__hint">Pick the value to set:</p>
        <div className="value-picker__values">
          {values.map(value => (
            <Button key={value.key} className="value-picker__button" onClick={() => onPick(value.key)}>
              <ValuePill label={value.label} color={value.color}/>
            </Button>
          ))}
          <Button className="value-picker__button" onClick={() => onPick(null)}>Empty</Button>
        </div>
      </Content>
      <Panel>
        <Button onClick={onCancel}>Cancel</Button>
      </Panel>
    </Dialog>
  );
};
