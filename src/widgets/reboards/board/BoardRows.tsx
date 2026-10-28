import React, {memo} from 'react';
import type {BoardLayout} from '../model/layout';
import {BoardRow} from './BoardRow';
import {OuterRow} from './OuterRow';

type Props = {
  layout: BoardLayout;
  collapsedRows: Set<string>;
  collapsedOuterRows: Set<string>;
  collapsedGroups: Set<string>;
  onToggleRow: (rowKey: string) => void;
  onToggleOuter: (outerKey: string) => void;
  onToggleGroup: (groupKey: string) => void;
};

/** All swimlanes of the board: first-level groups on two-level boards, plain rows otherwise. */
const BoardRowsComponent: React.FC<Props> = ({layout, collapsedRows, collapsedOuterRows, collapsedGroups, onToggleRow, onToggleOuter, onToggleGroup}) => {
  if (layout.twoLevel) {
    return (
      <>
        {layout.outerRows.map(outer => (
          <OuterRow
            key={outer.key}
            outer={outer}
            rowsByKey={layout.rowsByKey}
            columns={layout.columns}
            collapsed={collapsedOuterRows.has(outer.key)}
            collapsedRows={collapsedRows}
            collapsedGroups={collapsedGroups}
            onToggleOuter={onToggleOuter}
            onToggleRow={onToggleRow}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {layout.rows.map(row => (
        <BoardRow
          key={row.key}
          row={row}
          columns={layout.columns}
          collapsed={collapsedRows.has(row.key)}
          collapsedGroups={collapsedGroups}
          onToggleRow={onToggleRow}
          onToggleGroup={onToggleGroup}
        />
      ))}
    </>
  );
};

export const BoardRows = memo(BoardRowsComponent);
