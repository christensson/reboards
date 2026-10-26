import React, {useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Dropdown from '@jetbrains/ring-ui-built/components/dropdown/dropdown';
import PopupMenu from '@jetbrains/ring-ui-built/components/popup-menu/popup-menu';
import {Directions} from '@jetbrains/ring-ui-built/components/popup/popup.consts';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import addIcon from '@jetbrains/icons/add';
import searchIcon from '@jetbrains/icons/search';
import settingsIcon from '@jetbrains/icons/settings';
import swapIcon from '@jetbrains/icons/unsorted';
import updateIcon from '@jetbrains/icons/update';
import {type BoardConfig, isTwoLevel} from '@/common/model/board-config';
import type {CardSize, ConnectorsMode} from '@/common/storage/prefs';
import type {FieldUniverse} from '../model/fieldUniverse';

export const ALL_SPRINTS = '';

const CONNECTOR_ITEMS: SelectItem[] = [
  {key: 'none', label: 'Relations not shown'},
  {key: 'all', label: 'Show relations'},
  {key: 'selected', label: 'Show relations for selected'}
];

type Props = {
  boards: BoardConfig[];
  board: BoardConfig;
  universe: FieldUniverse;
  sprint: string | null;
  searchTerm: string;
  /** Name of a card field; cards where it is unset are highlighted. */
  quickFilter: string | null;
  onQuickFilter: (field: string | null) => void;
  cardSize: CardSize;
  connectorsMode: ConnectorsMode;
  loading: boolean;
  status: string;
  onSelectBoard: (boardId: string) => void;
  onNewBoard: () => void;
  swappedSwimlanes: boolean;
  onToggleSwappedSwimlanes: () => void;
  onOpenSettings: () => void;
  onSelectSprint: (sprint: string | null) => void;
  onSearchChange: (term: string) => void;
  onSearchSubmit: () => void;
  onCardSize: (size: CardSize) => void;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onRefresh: () => void;
};

export const Toolbar: React.FC<Props> = ({
  boards,
  board,
  universe,
  sprint,
  searchTerm,
  quickFilter,
  onQuickFilter,
  cardSize,
  connectorsMode,
  loading,
  status,
  onSelectBoard,
  onNewBoard,
  swappedSwimlanes,
  onToggleSwappedSwimlanes,
  onOpenSettings,
  onSelectSprint,
  onSearchChange,
  onSearchSubmit,
  onCardSize,
  onConnectorsMode,
  onRefresh
}) => {
  const boardItems = useMemo<SelectItem[]>(
    () => boards.map(b => ({key: b.id, label: b.name, description: b.shared ? undefined : 'personal'})),
    [boards]
  );
  const filterItems = useMemo<SelectItem[]>(
    () =>
      board.cardFields
        .filter(name => universe.byName.get(name)?.canBeEmpty !== false)
        .map(name => ({key: name, label: `No ${name}`})),
    [board.cardFields, universe]
  );
  const sprintItems = useMemo<SelectItem[]>(() => {
    const fieldName = board.sprints.field?.name;
    const values = fieldName ? (universe.byName.get(fieldName)?.values ?? []) : [];
    return [{key: ALL_SPRINTS, label: 'All sprints'}, ...values.map(v => ({key: v.key, label: v.label}))];
  }, [board.sprints.field, universe]);

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <Select
          type={Select.Type.BUTTON}
          label="Select board"
          filter
          data={boardItems}
          selected={boardItems.find(item => item.key === board.id) ?? null}
          onChange={(item: SelectItem | null) => item && onSelectBoard(String(item.key))}
        />
        <Button icon={settingsIcon} title="Board settings" onClick={onOpenSettings}/>
        <Button icon={addIcon} title="New board" onClick={onNewBoard}/>
        {isTwoLevel(board) && (
          <Button
            icon={swapIcon}
            active={swappedSwimlanes}
            title={swappedSwimlanes ? 'Swimlane levels are swapped. Click to restore' : 'Swap the two swimlane levels'}
            onClick={onToggleSwappedSwimlanes}
          />
        )}
      </div>
      {board.sprints.enabled && (
        <div className="toolbar__group">
          <Select
            type={Select.Type.BUTTON}
            label="Sprint"
            filter
            data={sprintItems}
            selected={sprintItems.find(item => item.key === (sprint ?? ALL_SPRINTS)) ?? sprintItems[0]}
            onChange={(item: SelectItem | null) => onSelectSprint(item && item.key !== ALL_SPRINTS ? String(item.key) : null)}
          />
        </div>
      )}
      <div className="toolbar__group toolbar__group_search">
        {quickFilter && (
          <Tag onRemove={() => onQuickFilter(null)} readOnly={false} className="toolbar__filter-tag">{`No ${quickFilter}`}</Tag>
        )}
        <Dropdown
          className="toolbar__search-wrap"
          disabled={filterItems.length === 0}
          anchor={(
            <Input
              className="toolbar__search"
              icon={searchIcon}
              size={Size.M}
              placeholder="Find issue by ID or summary"
              value={searchTerm}
              onChange={event => onSearchChange(event.target.value)}
              onClear={() => onSearchChange('')}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSearchSubmit();
                }
              }}
            />
          )}
        >
          <PopupMenu
            directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]}
            minWidth="target"
            closeOnSelect
            data={filterItems}
            onSelect={(item: SelectItem) => onQuickFilter(String(item.key))}
          />
        </Dropdown>
      </div>
      <div className="toolbar__group">
        <ButtonGroup>
          <Button active={cardSize === 'small'} onClick={() => onCardSize('small')}>Small</Button>
          <Button active={cardSize === 'normal'} onClick={() => onCardSize('normal')}>Normal</Button>
        </ButtonGroup>
      </div>
      <div className="toolbar__group">
        <Select
          type={Select.Type.BUTTON}
          data={CONNECTOR_ITEMS}
          selected={CONNECTOR_ITEMS.find(item => item.key === connectorsMode) ?? CONNECTOR_ITEMS[2]}
          onChange={(item: SelectItem | null) => item && onConnectorsMode(item.key as ConnectorsMode)}
        />
      </div>
      <div className="toolbar__group toolbar__group_status">
        {loading ? <LoaderInline/> : null}
        <span className="toolbar__status">{status}</span>
        <Button icon={updateIcon} title="Refresh" onClick={onRefresh} disabled={loading}/>
      </div>
    </div>
  );
};
