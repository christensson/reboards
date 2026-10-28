import React, {useEffect, useState} from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import type {RelationOption} from '../model/linkTargets';

export type RelationIssue = {id: string; idReadable: string; summary: string};

type Props = {
  from: RelationIssue | null;
  to: RelationIssue | null;
  options: RelationOption[];
  onAdd: (option: RelationOption) => void;
  onCancel: () => void;
};

const IssueRef: React.FC<{issue: RelationIssue}> = ({issue}) => (
  <span className="relation-picker__issue" title={`${issue.idReadable}: ${issue.summary}`}>
    <span className="relation-picker__issue-id">{issue.idReadable}</span>
    {issue.summary && <span className="relation-picker__issue-summary">{issue.summary}</span>}
  </span>
);

/** Reads the relation as a sentence: "<from> <relation> <to>". */
const Sentence: React.FC<{from: RelationIssue; to: RelationIssue; verb: string}> = ({from, to, verb}) => (
  <span className="relation-picker__sentence">
    <IssueRef issue={from}/>
    <strong className="relation-picker__verb">{verb}</strong>
    <IssueRef issue={to}/>
  </span>
);

const groupByType = (options: RelationOption[]): [string, RelationOption[]][] => {
  const groups = new Map<string, RelationOption[]>();
  options.forEach(option => groups.set(option.typeName, [...(groups.get(option.typeName) ?? []), option]));
  return Array.from(groups.entries());
};

/** Asks which relation to add between a Ctrl+Shift-dragged issue and the issue it was dropped on. */
export const RelationPickerDialog: React.FC<Props> = ({from, to, options, onAdd, onCancel}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => setSelectedKey(null), [from?.id, to?.id]);
  const selected = options.find(o => o.key === selectedKey && !o.existing) ?? null;
  return (
    <Dialog show={from !== null && to !== null} onCloseAttempt={onCancel} label="Add a relation" trapFocus>
      <Header>{from && to ? `Add a relation between ${from.idReadable} and ${to.idReadable}` : ''}</Header>
      <Content>
        <p className="value-picker__hint">Choose how the dragged issue relates to the issue it was dropped on:</p>
        {from && to && (
          <div className="relation-picker__groups">
            {groupByType(options).map(([typeName, group]) => (
              <div key={typeName} className="relation-picker__group">
                <div className="relation-picker__type">{typeName}</div>
                {group.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    disabled={option.existing}
                    className={`relation-picker__option${option.key === selected?.key ? ' relation-picker__option_selected' : ''}`}
                    onClick={() => setSelectedKey(option.key)}
                    onDoubleClick={() => onAdd(option)}
                  >
                    <Sentence from={from} to={to} verb={option.verb}/>
                    {option.existing && <span className="relation-picker__existing">(already linked)</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {from && to && (
          <p className="relation-picker__preview">
            {selected ? <>Will add: <Sentence from={from} to={to} verb={selected.verb}/></> : 'Select a relation to add.'}
          </p>
        )}
      </Content>
      <Panel>
        <Button primary disabled={!selected} onClick={() => selected && onAdd(selected)}>Add relation</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Panel>
    </Dialog>
  );
};
