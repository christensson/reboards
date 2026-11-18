import React from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {FieldSelect} from '@/common/components/FieldSelect';
import {
  type GanttConfig,
  type PlanLevel,
  ROWS_BY_DUE,
  type TimeBucket,
  type TimelineConfig,
  fitTimeline,
  isPlanLevelComplete,
  levelIdOfRowsBy,
  rowsByLevel
} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';
import {TIMING_FLAGS, timingFlagsFor} from '../model/timeline';

type Props = {
  universe: FieldUniverse;
  timeline: TimelineConfig;
  gantt: GanttConfig;
  disabled: boolean;
  onChange: (timeline: TimelineConfig) => void;
};

const SOURCE_LABELS: Record<PlanLevel['source'], string> = {
  'dates': 'start and end dates',
  'date-period': 'date and period',
  'date': 'a date',
  'version': 'versions',
  'build': 'builds'
};

const POSITION_ITEMS: SelectItem[] = [
  {key: 'start', label: 'Start'},
  {key: 'end', label: 'End'}
];

const BUCKET_ITEMS: SelectItem[] = [
  {key: 'sprint', label: 'Sprint', description: 'A row per version'},
  {key: 'day', label: 'Day'},
  {key: 'week', label: 'Week', description: 'Monday to Sunday'},
  {key: 'month', label: 'Month'},
  {key: 'quarter', label: 'Quarter'}
];

const SORT_ITEMS: SelectItem[] = [
  {key: 'asc', label: 'Oldest first'},
  {key: 'desc', label: 'Newest first'}
];

type ChoiceProps = {label: string; items: SelectItem[]; value: string; disabled: boolean; help?: string; onChange: (key: string) => void};

const Choice: React.FC<ChoiceProps> = ({label, items, value, disabled, help, onChange}) => (
  <div className="settings-field">
    <span className="settings-field__label">{label}</span>
    <Select
      type={Select.Type.BUTTON}
      disabled={disabled}
      data={items}
      selected={items.find(item => item.key === value) ?? items[0]}
      onChange={(item: SelectItem | null) => item && onChange(String(item.key))}
    />
    {help && <span className="settings-field__help">{help}</span>}
  </div>
);

/** The levels and due date time rows can follow. */
const rowsByItems = (gantt: GanttConfig): SelectItem[] => [
  ...gantt.levels.filter(isPlanLevelComplete).map(level => ({key: rowsByLevel(level.id), label: level.name || level.field?.name || 'Plan', description: SOURCE_LABELS[level.source]})),
  ...(gantt.dueField ? [{key: ROWS_BY_DUE, label: 'Due date', description: gantt.dueField.name}] : [])
];

/** The time layout's rows: what places issues, which end of their plan, the row size and order, and the highlights. */
export const TimelineEditor: React.FC<Props> = ({universe, timeline, gantt, disabled, onChange}) => {
  const patch = (changes: Partial<TimelineConfig>) => onChange({...timeline, ...changes});
  const items = rowsByItems(gantt);
  const level = gantt.levels.find(other => other.id === levelIdOfRowsBy(timeline.rowsBy));
  // A single date, a due date: both ends are the same day.
  const hasEnds = Boolean(level) && level?.source !== 'date';
  const buckets = BUCKET_ITEMS.filter(item => item.key !== 'sprint' || level?.source === 'version');
  const meaning = hasEnds ? timeline.position : 'end';
  const flags = timingFlagsFor(meaning).map(flag => TIMING_FLAGS[flag].label.toLowerCase());
  return (
    <>
      <Choice
        label="Time rows by"
        items={items}
        value={timeline.rowsBy}
        disabled={disabled || items.length === 0}
        help={items.length === 0 ? 'Set up a planning level or a due date first.' : 'The plan or date that puts each issue in a row.'}
        onChange={rowsBy => onChange(fitTimeline({...timeline, rowsBy}, gantt))}
      />
      {hasEnds && (
        <Choice
          label="Place issues at their"
          items={POSITION_ITEMS}
          value={timeline.position}
          disabled={disabled}
          help={`Start flags late starts; End flags overdue work.`}
          onChange={key => patch({position: key as TimelineConfig['position']})}
        />
      )}
      <Choice
        label="Row size"
        items={buckets}
        value={timeline.bucket}
        disabled={disabled}
        help="Each row holds the issues placed in that period; rows without issues are left out."
        onChange={key => patch({bucket: key as TimeBucket})}
      />
      <Choice label="Sort" items={SORT_ITEMS} value={timeline.sort} disabled={disabled} onChange={key => patch({sort: key as TimelineConfig['sort']})}/>
      <div className="settings-field">
        <Toggle checked={timeline.highlights} disabled={disabled} onChange={event => patch({highlights: event.target.checked})}>
          Highlight timing problems
        </Toggle>
        <span className="settings-field__help">{`Cards get an icon, and the highlight menu offers: ${flags.join(', ')}.`}</span>
      </div>
      <div className="settings-field">
        <span className="settings-field__label">Assignee field</span>
        <FieldSelect
          universe={universe}
          kinds={['user']}
          singleOnly
          allowNone
          noneLabel="None"
          value={timeline.assigneeField}
          disabled={disabled || !timeline.highlights}
          onChange={assigneeField => patch({assigneeField})}
        />
        <span className="settings-field__help">Issues without a value here count as unassigned.</span>
      </div>
    </>
  );
};
