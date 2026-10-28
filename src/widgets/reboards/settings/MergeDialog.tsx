import React, {useEffect, useState} from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Content, Header} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import type {BoardConfig} from '@/common/model/board-config';
import {MERGE_GROUPS, type MergeChoice, type MergeGroup, type MergeResult, summarizeGroup} from '@/common/model/board-merge';

export type PendingMerge = {result: MergeResult; mine: BoardConfig; theirs: BoardConfig};

type Props = {
  merge: PendingMerge | null;
  onApply: (choices: Partial<Record<MergeGroup, MergeChoice>>) => void;
  onCancel: () => void;
};

type ConflictProps = {
  group: MergeGroup;
  merge: PendingMerge;
  choice: MergeChoice;
  onChoose: (choice: MergeChoice) => void;
};

const ConflictChoice: React.FC<ConflictProps> = ({group, merge, choice, onChoose}) => (
  <fieldset className="merge-dialog__conflict">
    <legend className="merge-dialog__group">{MERGE_GROUPS[group].label}</legend>
    {(['mine', 'theirs'] as const).map(side => (
      <label key={side} className="merge-dialog__option">
        <input type="radio" name={`merge-${group}`} checked={choice === side} onChange={() => onChoose(side)}/>
        <span className="merge-dialog__side">{side === 'mine' ? 'Keep mine' : 'Use theirs'}</span>
        <span className="merge-dialog__value">{summarizeGroup(group, side === 'mine' ? merge.mine : merge.theirs)}</span>
      </label>
    ))}
  </fieldset>
);

/** Shows what merged on its own after a version conflict, and asks which side wins where both changed the same settings. */
export const MergeDialog: React.FC<Props> = ({merge, onApply, onCancel}) => {
  const [choices, setChoices] = useState<Partial<Record<MergeGroup, MergeChoice>>>({});
  useEffect(() => setChoices({}), [merge]);
  const theirsApplied = merge?.result.theirsApplied ?? [];
  const conflicts = merge?.result.conflicts ?? [];
  return (
    <Dialog show={merge !== null} onCloseAttempt={onCancel} label="Merge changes" trapFocus>
      <Header>Someone else saved this board</Header>
      <Content>
        <p className="value-picker__hint">
          The board was saved by someone else while you were editing it.
        </p>
        {theirsApplied.length > 0 && (
          <p className="merge-dialog__note">{`Their changes are merged into yours: ${theirsApplied.map(g => MERGE_GROUPS[g].label).join(', ')}.`}</p>
        )}
        {conflicts.length === 0 && <p className="merge-dialog__note">None of your changes conflict with theirs.</p>}
        {merge && conflicts.map(group => (
          <ConflictChoice
            key={group}
            group={group}
            merge={merge}
            choice={choices[group] ?? 'mine'}
            onChoose={choice => setChoices(prev => ({...prev, [group]: choice}))}
          />
        ))}
        <p className="merge-dialog__note">Nothing is saved yet: review the result, then save again.</p>
      </Content>
      <Panel>
        <Button primary onClick={() => onApply(choices)}>Apply</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Panel>
    </Dialog>
  );
};
