import React, {memo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import chevronRightIcon from '@jetbrains/icons/chevron-right';
import {ValuePill} from '@/common/components/ValuePill';
import type {LayoutColumn, LayoutOuterRow, LayoutRow} from '../model/layout';
import {BoardRow} from './BoardRow';

type Props = {
  outer: LayoutOuterRow;
  rowsByKey: Record<string, LayoutRow>;
  columns: LayoutColumn[];
  collapsed: boolean;
  collapsedRows: Set<string>;
  collapsedGroups: Set<string>;
  onToggleOuter: (outerKey: string) => void;
  onToggleRow: (rowKey: string) => void;
  onToggleGroup: (groupKey: string) => void;
};

/** First-level swimlane of a two-level board: a rotated title column spanning its inner swimlanes. */
const OuterRowComponent: React.FC<Props> = ({outer, rowsByKey, columns, collapsed, collapsedRows, collapsedGroups, onToggleOuter, onToggleRow, onToggleGroup}) => {
  const label = outer.color ? (
    <ValuePill label={outer.label} color={outer.color} className="outer-row__label"/>
  ) : (
    <span className={`outer-row__label${outer.isUncategorized ? ' outer-row__label_uncategorized' : ''}`} title={outer.label}>{outer.label}</span>
  );
  const toggle = (
    <Button
      className="outer-row__toggle"
      icon={collapsed ? chevronRightIcon : chevronDownIcon}
      title={collapsed ? 'Expand swimlane' : 'Collapse swimlane'}
      onClick={() => onToggleOuter(outer.key)}
    />
  );
  if (collapsed) {
    return (
      <div className="outer-row outer-row_collapsed" data-outer-key={outer.key}>
        <div className="outer-row__collapsed-header">
          {toggle}
          {label}
          <span className="outer-row__count" title="Issues in this swimlane">{outer.issueCount}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="outer-row" data-outer-key={outer.key}>
      <div className="outer-row__header">
        {toggle}
        {label}
        <span className="outer-row__count" title="Issues in this swimlane">{outer.issueCount}</span>
      </div>
      <div className="outer-row__body">
        {outer.rowKeys.map(key => {
          const row = rowsByKey[key];
          return row ? (
            <BoardRow
              key={key}
              row={row}
              columns={columns}
              collapsed={collapsedRows.has(key)}
              collapsedGroups={collapsedGroups}
              onToggleRow={onToggleRow}
              onToggleGroup={onToggleGroup}
            />
          ) : null;
        })}
      </div>
    </div>
  );
};

export const OuterRow = memo(OuterRowComponent);
