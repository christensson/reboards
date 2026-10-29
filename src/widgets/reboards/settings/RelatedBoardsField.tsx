import React, {useMemo} from 'react';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import type {BoardConfig} from '@/common/model/board-config';

type Props = {
  /** Id of the edited board; empty for a board not stored yet. */
  boardId: string;
  /** The edited board's own links. */
  value: string[];
  /** Boards the user can see. */
  boards: BoardConfig[];
  disabled: boolean;
  onChange: (relatedBoards: string[]) => void;
};

const byName = (a: BoardConfig, b: BoardConfig): number => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});

/**
 * The boards this board links to, plus, read only, the boards that link to it. A link shows on
 * both boards, but only the board that holds it can remove it.
 */
export const RelatedBoardsField: React.FC<Props> = ({boardId, value, boards, disabled, onChange}) => {
  const others = useMemo(() => boards.filter(b => b.id !== boardId).sort(byName), [boards, boardId]);
  const data = useMemo<SelectItem[]>(
    () => others.map(b => ({key: b.id, label: b.name || 'Untitled board', description: b.shared ? 'shared' : 'personal'})),
    [others]
  );
  const selected = data.filter(item => value.includes(String(item.key)));
  const linkedFrom = others.filter(b => boardId && b.relatedBoards.includes(boardId) && !value.includes(b.id));
  const change = (items: SelectItem[]) => {
    // Links to boards this user cannot see stay: another editor made them.
    const visible = new Set(others.map(b => b.id));
    onChange([...value.filter(id => !visible.has(id)), ...items.map(item => String(item.key))]);
  };
  return (
    <div className="settings-field">
      <span className="settings-field__label">Related boards</span>
      <Select
        type={Select.Type.BUTTON}
        multiple
        filter
        disabled={disabled}
        label="No related boards"
        data={data}
        selected={selected}
        onChange={change}
      />
      {linkedFrom.length > 0 && (
        <ul className="related-boards__incoming">
          {linkedFrom.map(b => (
            <li key={b.id} title="Remove it in that board's settings">{`Linked from ${b.name || 'Untitled board'}`}</li>
          ))}
        </ul>
      )}
      <span className="settings-field__help">Related boards get a button in the toolbar to switch between them; the link shows on both boards.</span>
    </div>
  );
};
