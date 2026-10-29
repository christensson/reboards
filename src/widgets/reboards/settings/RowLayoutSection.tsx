import React, {useRef} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import {type BoardConfig, type FieldKind, type FieldRef, type RowConfig, TIME_FIELD_KINDS} from '@/common/model/board-config';
import {type FieldUniverse, ROW_FIELD_KINDS, toFieldRef} from '../model/fieldUniverse';
import {SwimlanesSection} from './SwimlanesSection';
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
  {key: 'time', label: 'Time'}
];

/** The first field of the given kinds, to start a layout with. */
const firstField = (universe: FieldUniverse, kinds: FieldKind[], exclude: string | undefined): FieldRef | null => {
  const field = universe.fields.find(f => kinds.includes(f.kind as FieldKind) && f.name !== exclude && (f.kind === 'version' || !f.multi));
  return field ? toFieldRef(field) : null;
};

/**
 * Rows: swimlanes, a time layout, both or neither. With both, everyone switches between them on
 * the toolbar, starting from the default chosen here.
 */
export const RowLayoutSection: React.FC<Props> = ({draft, universe, readOnly, patch, sprintFieldName}) => {
  // What a toggle turned off, so turning it on again during this edit brings it back.
  const lastSwimlanes = useRef<{row: RowConfig; innerRow: RowConfig | null} | null>(null);
  const lastTimeField = useRef<FieldRef | null>(null);
  const swimlanesOn = Boolean(draft.row.field);
  const timeOn = Boolean(draft.timeline.field);
  const rowStart = firstField(universe, ROW_FIELD_KINDS, sprintFieldName);
  const timeStart = firstField(universe, TIME_FIELD_KINDS, sprintFieldName);

  const toggleSwimlanes = (on: boolean) => {
    if (on) {
      patch(lastSwimlanes.current ?? {row: {...draft.row, field: rowStart}, innerRow: null});
      return;
    }
    lastSwimlanes.current = {row: draft.row, innerRow: draft.innerRow};
    patch({row: {...draft.row, field: null}, innerRow: null});
  };
  const toggleTime = (on: boolean) => {
    if (!on) {
      lastTimeField.current = draft.timeline.field;
    }
    patch({timeline: {...draft.timeline, field: on ? (lastTimeField.current ?? timeStart) : null}});
  };

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
        <Toggle checked={timeOn} disabled={readOnly || (!timeOn && !timeStart && !lastTimeField.current)} onChange={event => toggleTime(event.target.checked)}>
          Time
        </Toggle>
        <span className="settings-field__help">Rows by the date of a field, across all columns; subtasks follow their parent.</span>
      </div>
      {timeOn && (
        <TimelineEditor
          universe={universe}
          timeline={draft.timeline}
          disabled={readOnly}
          excludeNames={sprintFieldName ? [sprintFieldName] : []}
          onChange={timeline => patch({timeline})}
        />
      )}
      {swimlanesOn && timeOn && (
        <div className="settings-field">
          <span className="settings-field__label">Default layout</span>
          <Select
            type={Select.Type.BUTTON}
            disabled={readOnly}
            data={DEFAULT_ITEMS}
            selected={DEFAULT_ITEMS.find(item => item.key === draft.defaultRowMode) ?? DEFAULT_ITEMS[0]}
            onChange={(item: SelectItem | null) => item && patch({defaultRowMode: item.key as BoardConfig['defaultRowMode']})}
          />
          <span className="settings-field__help">Everyone can switch between the two layouts on the toolbar. The choice is kept per user.</span>
        </div>
      )}
      {!swimlanesOn && !timeOn && <span className="settings-field__help">All issues are shown in one row.</span>}
    </>
  );
};
