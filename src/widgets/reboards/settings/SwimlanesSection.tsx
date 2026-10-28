import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import swapIcon from '@jetbrains/icons/changes';
import type {BoardConfig, RowConfig} from '@/common/model/board-config';
import type {FieldUniverse} from '../model/fieldUniverse';
import {RowsEditor} from './RowsEditor';

type Props = {
  universe: FieldUniverse;
  row: RowConfig;
  innerRow: RowConfig | null;
  readOnly: boolean;
  onChange: (patch: Partial<BoardConfig>) => void;
};

const EMPTY_ROW: RowConfig = {field: null, sort: 'custom', customOrder: []};

/** Both swimlane levels: the first field (left column when two are set) and the optional second field (bands). */
export const SwimlanesSection: React.FC<Props> = ({universe, row, innerRow, readOnly, onChange}) => (
  <>
    <RowsEditor
      universe={universe}
      row={row}
      disabled={readOnly}
      excludeNames={innerRow?.field ? [innerRow.field.name] : []}
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
      excludeNames={row.field ? [row.field.name] : []}
      onChange={next => onChange({innerRow: next.field ? next : null})}
    />
  </>
);
