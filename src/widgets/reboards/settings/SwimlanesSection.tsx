import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import swapIcon from '@jetbrains/icons/changes';
import {type BoardConfig, type RowConfig, emptyRow} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';
import {RowsEditor} from './RowsEditor';

type Props = {
  universe: FieldUniverse;
  row: RowConfig;
  innerRow: RowConfig | null;
  readOnly: boolean;
  onChange: (patch: Partial<BoardConfig>) => void;
  /** Sprint field of a sprint board; it selects the issues, so it cannot be a swimlane field. */
  sprintFieldName?: string;
};

const EMPTY_ROW: RowConfig = emptyRow();

/** Both swimlane levels: the first field (left column when two are set) and the optional second field (bands). */
export const SwimlanesSection: React.FC<Props> = ({universe, row, innerRow, readOnly, onChange, sprintFieldName}) => {
  const sprint = sprintFieldName ? [sprintFieldName] : [];
  return (
    <>
      <RowsEditor
        universe={universe}
        row={row}
        disabled={readOnly}
        excludeNames={[...sprint, ...(innerRow?.field ? [innerRow.field.name] : [])]}
        onChange={next => onChange({row: next})}
      />
      <div className="settings-actions">
        <Button
          icon={swapIcon}
          disabled={readOnly || !row.field || !innerRow?.field}
          title="Make the second field the first and vice versa"
          onClick={() => onChange({row: innerRow ?? EMPTY_ROW, innerRow: row})}
        >
          Swap the two swimlane fields
        </Button>
      </div>
      <span className="settings-field__help">
        With two fields, the first is shown as a column on the left and the second as swimlane bands inside it.
      </span>
      <RowsEditor
        universe={universe}
        row={innerRow ?? EMPTY_ROW}
        disabled={readOnly || !row.field}
        fieldLabel="Second swimlane field (optional)"
        noneLabel="None"
        excludeNames={[...sprint, ...(row.field ? [row.field.name] : [])]}
        onChange={next => onChange({innerRow: next.field ? next : null})}
      />
    </>
  );
};
