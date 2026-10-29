import React from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {FieldSelect} from '@/common/components/FieldSelect';
import {type FieldKind, TIME_FIELD_KINDS, type TimelineConfig, isDateKind} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';
import {TIMING_FLAGS, hasRange, timeMeaning, timingFlagsFor} from '../model/timeline';

type Props = {
  universe: FieldUniverse;
  timeline: TimelineConfig;
  disabled: boolean;
  /** Sprint field of a sprint board; it selects the issues, so it cannot be the time field. */
  excludeNames: string[];
  onChange: (timeline: TimelineConfig) => void;
};

const ROLE_ITEMS: SelectItem[] = [
  {key: 'start', label: 'Start date'},
  {key: 'end', label: 'End / due date'}
];

/**
 * What the date means, in short. Alone it also decides the timing checks; with a period the
 * placement setting does, so the text only says which way the period runs.
 */
const roleText = (timeline: TimelineConfig): string => {
  const date = timeline.field?.name ?? 'The date';
  const start = timeline.dateRole === 'start';
  if (timeline.periodField) {
    return start
      ? `${date} is when work starts; ${timeline.periodField.name} runs forward from it.`
      : `${date} is when work is due; ${timeline.periodField.name} runs back from it.`;
  }
  return start ? `${date} is when work starts; flags late starts.` : `${date} is when work is due; flags overdue work.`;
};

const POSITION_ITEMS: SelectItem[] = [
  {key: 'start', label: 'Start date'},
  {key: 'end', label: 'End / due date'}
];

const POSITION_EFFECT = 'Start flags late starts; End / due date flags overdue work.';

/** What the two ends of an issue's time are, in the words of the fields used. */
const rangeText = (timeline: TimelineConfig, kind: FieldKind | 'other' | undefined): string => {
  if (kind === 'version') {
    return 'Versions span start to release date.';
  }
  const date = timeline.field?.name ?? 'the date';
  const period = timeline.periodField?.name ?? 'the period';
  return timeline.dateRole === 'start'
    ? `Issues span ${date} to ${date} plus ${period}.`
    : `Issues span ${date} minus ${period} to ${date}.`;
};

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

/** The time layout: which field places the cards, what its date means, and the order. */
export const TimelineEditor: React.FC<Props> = ({universe, timeline, disabled, excludeNames, onChange}) => {
  const patch = (changes: Partial<TimelineConfig>) => onChange({...timeline, ...changes});
  const kind = timeline.field ? (universe.byName.get(timeline.field.name)?.kind ?? timeline.field.kind) : undefined;
  const isDate = isDateKind(kind);
  const range = Boolean(timeline.field) && hasRange(timeline, universe);
  const flags = timingFlagsFor(timeMeaning(timeline, universe)).map(flag => TIMING_FLAGS[flag].label.toLowerCase());
  return (
    <>
      <div className="settings-field">
        <span className="settings-field__label">Time field</span>
        <FieldSelect
          universe={universe}
          kinds={TIME_FIELD_KINDS}
          value={timeline.field}
          disabled={disabled}
          excludeNames={excludeNames}
          onChange={field => patch({field, ...(isDateKind(field?.kind) ? {} : {periodField: null})})}
        />
        <span className="settings-field__help">
          A date or date and time field, a version (from its start to its release date) or a build (its assembly date). Each time gets a row; issues without one come last.
        </span>
      </div>
      {isDate && (
        <div className="settings-field">
          <span className="settings-field__label">Period field (optional)</span>
          <FieldSelect
            universe={universe}
            kinds={['period']}
            allowNone
            noneLabel="No period"
            value={timeline.periodField}
            disabled={disabled}
            onChange={periodField => patch({periodField})}
          />
          <span className="settings-field__help">A duration, such as an estimation, that makes the date the start or the end of a range.</span>
        </div>
      )}
      {(isDate || kind === 'build') && (
        <Choice
          label="The date is"
          items={ROLE_ITEMS}
          value={timeline.dateRole}
          disabled={disabled}
          help={roleText(timeline)}
          onChange={key => patch({dateRole: key as TimelineConfig['dateRole']})}
        />
      )}
      {range && (
        <Choice
          label="Place issues on timeline at their"
          items={POSITION_ITEMS}
          value={timeline.position}
          disabled={disabled}
          help={`${rangeText(timeline, kind)} ${POSITION_EFFECT}`}
          onChange={key => patch({position: key as TimelineConfig['position']})}
        />
      )}
      <Choice label="Sort" items={SORT_ITEMS} value={timeline.sort} disabled={disabled} onChange={key => patch({sort: key as TimelineConfig['sort']})}/>
      <div className="settings-field">
        <Toggle checked={timeline.highlights} disabled={disabled} onChange={event => patch({highlights: event.target.checked})}>
          Highlight timing problems
        </Toggle>
        <span className="settings-field__help">
          {`Cards get an icon, and the highlight menu offers: ${flags.join(', ')}. Turn off when the time means neither a start nor an end.`}
        </span>
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
