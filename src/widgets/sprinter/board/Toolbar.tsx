import React, {useMemo, useRef} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import List from '@jetbrains/ring-ui-built/components/list/list';
import Dropdown from '@jetbrains/ring-ui-built/components/dropdown/dropdown';
import PopupMenu from '@jetbrains/ring-ui-built/components/popup-menu/popup-menu';
import {Directions} from '@jetbrains/ring-ui-built/components/popup/popup.consts';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Tag from '@jetbrains/ring-ui-built/components/tag/tag';
import addIcon from '@jetbrains/icons/add';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import searchIcon from '@jetbrains/icons/search';
import settingsIcon from '@jetbrains/icons/settings';
import starEmptyIcon from '@jetbrains/icons/star-empty';
import starFilledIcon from '@jetbrains/icons/star-filled';
import updateIcon from '@jetbrains/icons/update';
import {type BoardConfig} from '@/common/model/board-config';
import type {CardSize, ConnectorsMode} from '@/common/storage/prefs';
import {orderBoards} from '../model/boardOrder';
import type {FieldUniverse} from '../model/fieldUniverse';

export const ALL_SPRINTS = '';

const RELATION_OPTIONS: {mode: ConnectorsMode; label: string}[] = [
  {mode: 'none', label: 'None'},
  {mode: 'selected', label: 'For selected issues'},
  {mode: 'all', label: 'All'}
];

const NEW_ISSUE_KEY = 'new-issue';

type ShowMenuProps = {
  connectorsMode: ConnectorsMode;
  showNewIssue: boolean;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onShowNewIssue: (show: boolean) => void;
};

/** "Show" menu: which relation connectors to draw, and whether cells offer "New issue…". */
const ShowMenu: React.FC<ShowMenuProps> = ({connectorsMode, showNewIssue, onConnectorsMode, onShowNewIssue}) => {
  const items: SelectItem[] = [
    {key: 'relations-title', label: 'Relations', rgItemType: List.ListProps.Type.TITLE},
    ...RELATION_OPTIONS.map(option => ({key: option.mode, label: option.label, checkbox: connectorsMode === option.mode})),
    {key: 'separator', rgItemType: List.ListProps.Type.SEPARATOR},
    {key: NEW_ISSUE_KEY, label: 'New issue controls', checkbox: showNewIssue}
  ];
  const relationLabel = RELATION_OPTIONS.find(option => option.mode === connectorsMode)?.label.toLowerCase() ?? '';
  return (
    <Dropdown
      anchor={(
        <Button title={`Relations: ${relationLabel} · New issue controls: ${showNewIssue ? 'shown' : 'hidden'}`}>
          {'Show '}
          <Icon glyph={chevronDownIcon}/>
        </Button>
      )}
    >
      <PopupMenu
        directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]}
        closeOnSelect={false}
        data={items}
        onSelect={(item: SelectItem) => {
          if (item.key === NEW_ISSUE_KEY) {
            onShowNewIssue(!showNewIssue);
          } else if (RELATION_OPTIONS.some(option => option.mode === item.key)) {
            onConnectorsMode(item.key as ConnectorsMode);
          }
        }}
      />
    </Dropdown>
  );
};

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
  onOpenSettings: () => void;
  onSelectSprint: (sprint: string | null) => void;
  onSearchChange: (term: string) => void;
  /** Returns true when matches were selected; the search box then gives up focus. */
  onSearchSubmit: () => boolean;
  onCardSize: (size: CardSize) => void;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onRefresh: () => void;
  starredBoards: string[];
  /** Issues matching the search or quick filter; null when neither is active. */
  matchCount: number | null;
  showNewIssue: boolean;
  onShowNewIssue: (show: boolean) => void;
  onToggleStar: (boardId: string) => void;
};

const StarToggle: React.FC<{starred: boolean; onToggle: () => void}> = ({starred, onToggle}) => (
  <span
    role="button"
    tabIndex={-1}
    className={`board-star${starred ? ' board-star_active' : ''}`}
    title={starred ? 'Unstar board' : 'Star board'}
    onMouseDown={event => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onClick={event => {
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    }}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }
    }}
  >
    <Icon glyph={starred ? starFilledIcon : starEmptyIcon}/>
  </span>
);

/** Board selector items: starred boards first under a "Starred" separator, then the others. */
const buildBoardItems = (boards: BoardConfig[], starredIds: string[], onToggleStar: (boardId: string) => void): SelectItem[] => {
  const {starred, others} = orderBoards(boards, starredIds);
  const item = (b: BoardConfig, isStarred: boolean): SelectItem => ({
    key: b.id,
    label: b.name,
    description: b.shared ? undefined : 'personal',
    rightNodes: <StarToggle starred={isStarred} onToggle={() => onToggleStar(b.id)}/>
  });
  if (starred.length === 0) {
    return others.map(b => item(b, false));
  }
  const separator = (key: string, description: string): SelectItem => ({key, description, rgItemType: List.ListProps.Type.SEPARATOR});
  return [
    separator('__starred', 'Starred'),
    ...starred.map(b => item(b, true)),
    ...(others.length > 0 ? [separator('__others', 'Other boards'), ...others.map(b => item(b, false))] : [])
  ];
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
  onOpenSettings,
  onSelectSprint,
  onSearchChange,
  onSearchSubmit,
  onCardSize,
  onConnectorsMode,
  onRefresh,
  starredBoards,
  matchCount,
  showNewIssue,
  onShowNewIssue,
  onToggleStar
}) => {
  // The quick-filter menu opens from the search box; it closes when Enter has selected matches.
  const filterDropdownRef = useRef<Dropdown>(null);
  const boardItems = useMemo(() => buildBoardItems(boards, starredBoards, onToggleStar), [boards, starredBoards, onToggleStar]);
  const isStarred = starredBoards.includes(board.id);
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
        <Button
          icon={isStarred ? starFilledIcon : starEmptyIcon}
          className={isStarred ? 'star-button star-button_active' : 'star-button'}
          title={isStarred ? 'Unstar board' : 'Star board'}
          onClick={() => onToggleStar(board.id)}
        />
        <Button icon={settingsIcon} title="Board settings" onClick={onOpenSettings}/>
        <Button icon={addIcon} title="New board" onClick={onNewBoard}/>
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
          ref={filterDropdownRef}
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
                  if (onSearchSubmit()) {
                    event.currentTarget.blur();
                    filterDropdownRef.current?.toggle(false);
                  }
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
        {matchCount !== null && (
          <span className="toolbar__match-count" title="Issues on the board that match the search">{`${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}</span>
        )}
      </div>
      <div className="toolbar__group">
        <ButtonGroup>
          <Button active={cardSize === 'small'} onClick={() => onCardSize('small')}>Small</Button>
          <Button active={cardSize === 'normal'} onClick={() => onCardSize('normal')}>Normal</Button>
        </ButtonGroup>
      </div>
      <div className="toolbar__group">
        <ShowMenu
          connectorsMode={connectorsMode}
          showNewIssue={showNewIssue}
          onConnectorsMode={onConnectorsMode}
          onShowNewIssue={onShowNewIssue}
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
