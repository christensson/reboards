import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import {isPersonalAgile} from '@/common/model/agileSource';
import type {AgileSourceRef} from '@/common/model/board-config';
import type {YtAgile} from '@/common/youtrack/types';

type Props = {
  /** The agile boards the user can see; null while loading. */
  agiles: YtAgile[] | null;
  value: AgileSourceRef | null;
  /** A shared board cannot use a personal agile board. */
  shared: boolean;
  disabled: boolean;
  onChange: (agile: YtAgile | null) => void;
};

const NONE_KEY = '__projects__';

const describe = (agile: YtAgile, shared: boolean): string => {
  if (shared && isPersonalAgile(agile)) {
    return 'Personal agile board: cannot be used on a shared board';
  }
  const projects = (agile.projects ?? []).map(p => p.shortName).join(', ');
  return [projects, agile.sprintsSettings?.disableSprints ? 'no sprints' : 'sprints'].filter(Boolean).join(' · ');
};

/** Where the board's issues come from: its own projects and query, or an existing agile board. */
export const AgileSourceField: React.FC<Props> = ({agiles, value, shared, disabled, onChange}) => {
  const data = useMemo<SelectItem[]>(() => [
    {key: NONE_KEY, label: 'Projects and query'},
    ...(agiles ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(agile => ({key: agile.id, label: agile.name, description: describe(agile, shared), disabled: shared && isPersonalAgile(agile)}))
  ], [agiles, shared]);
  // A linked board the user cannot see (any more) still shows by its saved name.
  const selected = value
    ? (data.find(item => item.key === value.id) ?? {key: value.id, label: value.name})
    : data[0];
  return (
    <div className="settings-field">
      <span className="settings-field__label">Issues from</span>
      <Select
        type={Select.Type.BUTTON}
        filter
        loading={agiles === null}
        disabled={disabled}
        data={data}
        selected={selected}
        onChange={(item: SelectItem | null) => {
          if (item) {
            onChange(item.key === NONE_KEY ? null : (agiles ?? []).find(agile => agile.id === item.key) ?? null);
          }
        }}
      />
      <span className="settings-field__help">
        {value
          ? `The board shows the issues of the agile board ${value.name}, and its sprints; the query below filters them further.`
          : 'Or pick an agile board to show its issues and sprints, so the two boards never drift apart.'}
      </span>
    </div>
  );
};
