import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import addIcon from '@jetbrains/icons/add';
import {FieldSelect} from '@/common/components/FieldSelect';
import {SortableValueList} from '@/common/components/SortableValueList';
import {
  BOARD_LIMITS,
  DUE_FIELD_KINDS,
  ESTIMATION_FIELD_KINDS,
  type FieldKind,
  type GanttConfig,
  type PlanLevel,
  type PlanSource,
  newPlanLevel
} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';

type Props = {
  universe: FieldUniverse;
  gantt: GanttConfig;
  disabled: boolean;
  onChange: (gantt: GanttConfig) => void;
};

const DATE_KINDS: FieldKind[] = ['date', 'datetime'];

const SOURCE_ITEMS: SelectItem[] = [
  {key: 'dates', label: 'Start and end dates', description: 'Two date fields'},
  {key: 'date-period', label: 'Date and period', description: 'A date and a duration from or to it'},
  {key: 'version', label: 'Version (sprint) field', description: 'Earliest start to latest release'}
];

const ROLE_ITEMS: SelectItem[] = [
  {key: 'start', label: 'Date is the start; period runs forward'},
  {key: 'end', label: 'Date is the end; period runs back'}
];

const UNIT_ITEMS: SelectItem[] = [
  {key: 'hours', label: 'Hours'},
  {key: 'days', label: 'Days (8 hours)'}
];

const MEANING_ITEMS: SelectItem[] = [
  {key: 'remaining', label: 'Remaining work', description: 'Persons needed from today to the planned end'},
  {key: 'total', label: 'Total work', description: 'Persons needed over the whole planned span'}
];

type ChoiceProps = {items: SelectItem[]; value: string; disabled: boolean; label?: string; onChange: (key: string) => void};

const Choice: React.FC<ChoiceProps> = ({items, value, disabled, label, onChange}) => (
  <Select
    type={Select.Type.BUTTON}
    size={Select.Size.AUTO}
    label={label}
    disabled={disabled}
    data={items}
    selected={items.find(item => item.key === value) ?? items[0]}
    onChange={(item: SelectItem | null) => item && onChange(String(item.key))}
  />
);

type LevelProps = {level: PlanLevel; universe: FieldUniverse; disabled: boolean; onChange: (changes: Partial<PlanLevel>) => void};

/** The fields of one planning level, as its source needs them. */
const LevelFields: React.FC<LevelProps> = ({level, universe, disabled, onChange}) => {
  if (level.source === 'version') {
    return <FieldSelect universe={universe} kinds={['version']} label="Version field" value={level.field} disabled={disabled} onChange={field => onChange({field})}/>;
  }
  if (level.source === 'dates') {
    return (
      <>
        <FieldSelect universe={universe} kinds={DATE_KINDS} label="Start date" value={level.field} disabled={disabled} onChange={field => onChange({field})}/>
        <FieldSelect universe={universe} kinds={DATE_KINDS} label="End date" value={level.endField} disabled={disabled} onChange={endField => onChange({endField})}/>
      </>
    );
  }
  return (
    <>
      <FieldSelect universe={universe} kinds={DATE_KINDS} label="Date" value={level.field} disabled={disabled} onChange={field => onChange({field})}/>
      <FieldSelect universe={universe} kinds={['period']} label="Period" value={level.periodField} disabled={disabled} onChange={periodField => onChange({periodField})}/>
      <Choice items={ROLE_ITEMS} value={level.dateRole} disabled={disabled} onChange={key => onChange({dateRole: key as PlanLevel['dateRole']})}/>
    </>
  );
};

/** A new source keeps a field that still fits it. */
const switchSource = (level: PlanLevel, source: PlanSource): Partial<PlanLevel> => {
  const fits = source === 'version' ? level.field?.kind === 'version' : level.field && DATE_KINDS.includes(level.field.kind);
  return {source, field: fits ? level.field : null};
};

const isNumberKind = (kind: FieldKind | 'other' | undefined): boolean => kind === 'integer' || kind === 'float';

/**
 * The Gantt layout: planning levels from high-level to detailed, the due date and the estimate.
 * It is offered next to the time layout once a planning level or a due date is set up.
 */
export const GanttEditor: React.FC<Props> = ({universe, gantt, disabled, onChange}) => {
  const patch = (changes: Partial<GanttConfig>) => onChange({...gantt, ...changes});
  const {levels} = gantt;
  const updateLevel = (id: string, changes: Partial<PlanLevel>) => patch({levels: levels.map(level => (level.id === id ? {...level, ...changes} : level))});
  const estimationKind = gantt.estimationField ? (universe.byName.get(gantt.estimationField.name)?.kind ?? gantt.estimationField.kind) : undefined;
  return (
    <>
      <div className="settings-field">
        <span className="settings-field__label">Gantt chart (optional)</span>
        <span className="settings-field__help">
          A Gantt layout next to the time layout: plans as bars, due dates as diamonds, and the persons needed to finish the estimate in time.
        </span>
      </div>
      <div className="settings-field">
        <span className="settings-field__label">Planning levels</span>
        <SortableValueList
          items={levels.map(level => ({id: level.id, label: level.name, level}))}
          disabled={disabled}
          onReorder={ids => patch({levels: ids.map(id => levels.find(level => level.id === id)).filter((level): level is PlanLevel => Boolean(level))})}
          onRemove={id => patch({levels: levels.filter(level => level.id !== id)})}
          emptyMessage="No planning levels"
          renderItem={({level}) => (
            <span className="gantt-editor__level">
              <Input
                size={Size.S}
                value={level.name}
                disabled={disabled}
                placeholder="Name"
                aria-label="Planning level name"
                onChange={event => updateLevel(level.id, {name: event.target.value})}
              />
              <Choice items={SOURCE_ITEMS} value={level.source} disabled={disabled} onChange={key => updateLevel(level.id, switchSource(level, key as PlanSource))}/>
              <LevelFields level={level} universe={universe} disabled={disabled} onChange={changes => updateLevel(level.id, changes)}/>
            </span>
          )}
        />
        <div className="settings-actions">
          <Button icon={addIcon} disabled={disabled || levels.length >= BOARD_LIMITS.planLevels} onClick={() => patch({levels: [...levels, newPlanLevel(levels.length)]})}>
            Add planning level
          </Button>
        </div>
        <span className="settings-field__help">
          Order from high-level to detailed, such as a roadmap planned with dates, then sprints. The most detailed plan is the solid bar and sets the persons needed; coarser plans are frames around it. Periods count 8 hour days and 5 day weeks.
        </span>
      </div>
      <div className="settings-field">
        <span className="settings-field__label">Due date field</span>
        <FieldSelect universe={universe} kinds={DUE_FIELD_KINDS} allowNone noneLabel="No due date" value={gantt.dueField} disabled={disabled} onChange={dueField => patch({dueField})}/>
        <span className="settings-field__help">The deadline, drawn as a diamond; red when the issue is overdue or planned to end after it.</span>
      </div>
      <div className="settings-field">
        <span className="settings-field__label">Estimation field</span>
        <FieldSelect
          universe={universe}
          kinds={ESTIMATION_FIELD_KINDS}
          allowNone
          noneLabel="No estimation"
          value={gantt.estimationField}
          disabled={disabled}
          onChange={estimationField => patch({estimationField})}
        />
        <span className="settings-field__help">The work an issue needs: a period, or a number of hours or days. Subtasks with only an estimate are drawn in their parent’s plan.</span>
      </div>
      {gantt.estimationField && isNumberKind(estimationKind) && (
        <div className="settings-field">
          <span className="settings-field__label">Estimation unit</span>
          <Choice items={UNIT_ITEMS} value={gantt.estimationUnit} disabled={disabled} onChange={key => patch({estimationUnit: key as GanttConfig['estimationUnit']})}/>
        </div>
      )}
      {gantt.estimationField && (
        <div className="settings-field">
          <span className="settings-field__label">The estimate is</span>
          <Choice items={MEANING_ITEMS} value={gantt.estimationMeaning} disabled={disabled} onChange={key => patch({estimationMeaning: key as GanttConfig['estimationMeaning']})}/>
          <span className="settings-field__help">
            {gantt.estimationMeaning === 'remaining'
              ? 'Work left: persons needed = estimate ÷ working days from today (or the planned start) to the planned end, or the due date.'
              : 'All the work: persons needed = estimate ÷ working days from the planned start to the planned end.'}
          </span>
        </div>
      )}
    </>
  );
};
