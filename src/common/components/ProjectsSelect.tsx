import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import type {ProjectRef} from '@/common/model/board-config';
import type {YtProject} from '@/common/youtrack/types';

type Props = {
  projects: YtProject[];
  value: ProjectRef[];
  onChange: (projects: ProjectRef[]) => void;
  loading?: boolean;
  disabled?: boolean;
};

/** Multi-select over the projects the current user can see. */
export const ProjectsSelect: React.FC<Props> = ({projects, value, onChange, loading, disabled}) => {
  const data = useMemo<SelectItem[]>(
    () => projects.map(p => ({key: p.id, label: p.name, description: p.shortName})),
    [projects]
  );
  const selected = useMemo<SelectItem[]>(
    () => value.map(p => data.find(item => item.key === p.id) ?? {key: p.id, label: p.shortName}),
    [value, data]
  );
  return (
    <Select
      multiple
      type={Select.Type.BUTTON}
      label="Select projects"
      filter
      loading={loading}
      disabled={disabled}
      data={data}
      selected={selected}
      onChange={items =>
        onChange(
          items.map(item => {
            const project = projects.find(p => p.id === item.key);
            return {id: String(item.key), shortName: project?.shortName ?? String(item.label)};
          })
        )
      }
    />
  );
};
