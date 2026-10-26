import React from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import {ValuePill} from '@/common/components/ValuePill';
import type {ColumnConfig} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';

type Props = {
  column: ColumnConfig | null;
  fieldName: string;
  universe: FieldUniverse;
  issueLabel: string;
  onPick: (value: string) => void;
  onCancel: () => void;
};

/** Asks which value to set when an issue is dropped into a column that combines several values. */
export const ValuePickerDialog: React.FC<Props> = ({column, fieldName, universe, issueLabel, onPick, onCancel}) => {
  const field = universe.byName.get(fieldName);
  return (
    <Dialog show={column !== null} onCloseAttempt={onCancel} label="Choose a value" trapFocus>
      <Header>{`Set ${fieldName} for ${issueLabel}`}</Header>
      <Content>
        <p className="value-picker__hint">This column combines several values. Pick the one to set:</p>
        <div className="value-picker__values">
          {(column?.values ?? []).map(value => {
            const meta = field?.values.find(v => v.key === value);
            return (
              <Button key={value} className="value-picker__button" onClick={() => onPick(value)}>
                <ValuePill label={meta?.label ?? value} color={meta?.color}/>
              </Button>
            );
          })}
        </div>
      </Content>
      <Panel>
        <Button onClick={onCancel}>Cancel</Button>
      </Panel>
    </Dialog>
  );
};
