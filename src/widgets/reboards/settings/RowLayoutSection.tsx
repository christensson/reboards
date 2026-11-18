import React, {useRef} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {type BoardConfig, type FieldKind, type FieldRef, type GanttConfig, type PlanLevel, type RowConfig, availableRowModes, fitTimeline, newPlanLevel, rowsByLevel} from '@/common/model/board-config';
import {type FieldUniverse, ROW_FIELD_KINDS, toFieldRef} from '../model/fieldUniverse';
import {SwimlanesSection} from './SwimlanesSection';
import {GanttEditor} from './GanttEditor';
import {TimelineEditor} from './TimelineEditor';

type Props = {
  draft: BoardConfig;
  universe: FieldUniverse;
  readOnly: boolean;
  patch: (changes: Partial<BoardConfig>) => void;
  /** Sprint field of a sprint board; it selects the issues, so no layout may use it. */
  sprintFieldName?: string;
};

const DEFAULT_ITEMS: SelectItem[] = [
  {key: 'swimlanes', label: 'Swimlanes'},
  {key: 'time', label: 'Time'},
  {key: 'gantt', label: 'Gantt'}
];

/** The first field of the given kinds, to start a layout with. */
const firstField = (universe: FieldUniverse, kinds: FieldKind[], exclude: string | undefined): FieldRef | null => {
  const field = universe.fields.find(f => kinds.includes(f.kind as FieldKind) && f.name !== exclude && (f.kind === 'version' || !f.multi));
  return field ? toFieldRef(field) : null;
};

/** A first planning level to start Time & planning with: a date field, else a version field. */
const startLevel = (universe: FieldUniverse, exclude: string | undefined): PlanLevel | null => {
  const date = firstField(universe, ['date', 'datetime'], exclude);
  const version = firstField(universe, ['version'], exclude);
  if (date) {
    return {...newPlanLevel(0), name: date.name, source: 'date', field: date};
  }
  return version ? {...newPlanLevel(0), name: version.name, source: 'version', field: version} : null;
};

/**
 * Rows: swimlanes, a time layout, both or neither. With both, everyone switches between them on
 * the toolbar, starting from the default chosen here.
 */
export const RowLayoutSection: React.FC<Props> = ({draft, universe, readOnly, patch, sprintFieldName}) => {
  // What a toggle turned off, so turning it on again during this edit brings it back.
  const lastSwimlanes = useRef<{row: RowConfig; innerRow: RowConfig | null} | null>(null);
  const swimlanesOn = Boolean(draft.row.field);
  const timeOn = draft.timeline.enabled;
  const modes = availableRowModes(draft);
  const defaultItems = DEFAULT_ITEMS.filter(item => modes.includes(item.key as BoardConfig['defaultRowMode']));
  const rowStart = firstField(universe, ROW_FIELD_KINDS, sprintFieldName);
  const timeStart = startLevel(universe, sprintFieldName);

  const toggleSwimlanes = (on: boolean) => {
    if (on) {
      patch(lastSwimlanes.current ?? {row: {...draft.row, field: rowStart}, innerRow: null});
      return;
    }
    lastSwimlanes.current = {row: draft.row, innerRow: draft.innerRow};
    patch({row: {...draft.row, field: null}, innerRow: null});
  };
  // Turning Time & planning on starts a plan when there is none; turning it off keeps the plan for later.
  const toggleTime = (on: boolean) => {
    if (!on) {
      patch({timeline: {...draft.timeline, enabled: false}});
      return;
    }
    const gantt: GanttConfig = draft.gantt.levels.length === 0 && timeStart ? {...draft.gantt, levels: [timeStart]} : draft.gantt;
    const rowsBy = draft.timeline.rowsBy || (gantt.levels[0] ? rowsByLevel(gantt.levels[0].id) : '');
    patch({gantt, timeline: fitTimeline({...draft.timeline, enabled: true, rowsBy}, gantt)});
  };
  // Removing or changing a level keeps the time rows on something that exists.
  const patchGantt = (gantt: GanttConfig) => patch({gantt, timeline: fitTimeline(draft.timeline, gantt)});

  return (
    <>
      <div className="settings-field">
        <Toggle checked={swimlanesOn} disabled={readOnly || (!swimlanesOn && !rowStart && !lastSwimlanes.current)} onChange={event => toggleSwimlanes(event.target.checked)}>
          Swimlanes
        </Toggle>
        <span className="settings-field__help">Rows by the values of one or two fields.</span>
      </div>
      {swimlanesOn && (
        <SwimlanesSection universe={universe} row={draft.row} innerRow={draft.innerRow} readOnly={readOnly} onChange={patch} sprintFieldName={sprintFieldName}/>
      )}
      <div className="settings-field">
        <Toggle checked={timeOn} disabled={readOnly || (!timeOn && !timeStart && draft.gantt.levels.length === 0)} onChange={event => toggleTime(event.target.checked)}>
          Time & planning
        </Toggle>
        <span className="settings-field__help">
          When work is planned: planning levels, due date and estimate, shown as time rows across the columns and as a Gantt chart.
        </span>
      </div>
      {timeOn && <GanttEditor universe={universe} gantt={draft.gantt} disabled={readOnly} onChange={patchGantt}/>}
      {timeOn && <TimelineEditor universe={universe} timeline={draft.timeline} gantt={draft.gantt} disabled={readOnly} onChange={timeline => patch({timeline})}/>}
      {defaultItems.length > 1 && (
        <div className="settings-field">
          <span className="settings-field__label">Default layout</span>
          <Select
            type={Select.Type.BUTTON}
            disabled={readOnly}
            data={defaultItems}
            selected={defaultItems.find(item => item.key === draft.defaultRowMode) ?? defaultItems[0]}
            onChange={(item: SelectItem | null) => item && patch({defaultRowMode: item.key as BoardConfig['defaultRowMode']})}
          />
          <span className="settings-field__help">Everyone can switch between the layouts on the toolbar. The choice is kept per user.</span>
        </div>
      )}
      {!swimlanesOn && !timeOn && <span className="settings-field__help">All issues are shown in one row.</span>}
    </>
  );
};
