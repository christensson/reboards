import React, {useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
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
import type {UniverseValue} from '../model/fieldUniverse';
import {currentSprints, sortSprintsByDate, sprintDateRange} from '../model/sprints';
import {type DateFormatter, useDateFormat} from '../data/useDateFormat';

/** Selector key for issues without a sprint; it is also what an unset sprint (null) shows. */
export const UNSCHEDULED = '';

type FindMenuProps = {
  /** Card fields that may be empty: each offers a "No <field>" highlight. */
  fields: string[];
  quickFilter: string | null;
  onQuickFilter: (field: string | null) => void;
};

/** Radio-style indicator for menu items where only one option can be active. */
const OptionIndicator: React.FC<{selected: boolean}> = ({selected}) => (
  <span className={`option-indicator${selected ? ' option-indicator_selected' : ''}`} aria-hidden="true"/>
);

/** Magnifying glass menu: highlight issues where a card field is unset. */
const FindMenu: React.FC<FindMenuProps> = ({fields, quickFilter, onQuickFilter}) => {
  const items: SelectItem[] = [
    {key: 'highlight-title', label: 'Highlight issues with', rgItemType: List.ListProps.Type.TITLE},
    ...fields.map(name => ({key: name, label: `No ${name}`, leftNodes: <OptionIndicator selected={quickFilter === name}/>}))
  ];
  return (
    <Dropdown
      disabled={fields.length === 0}
      anchor={<Button icon={searchIcon} disabled={fields.length === 0} title={fields.length > 0 ? 'Highlight issues' : 'No card field can be empty'}/>}
    >
      <PopupMenu
        directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]}
        closeOnSelect
        data={items}
        onSelect={(item: SelectItem) => {
          if (fields.includes(String(item.key))) {
            onQuickFilter(item.key === quickFilter ? null : String(item.key));
          }
        }}
      />
    </Dropdown>
  );
};

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
  /** Opens the interactive find box (same as pressing "/"). */
  onOpenQuickFind: () => void;
  onCardSize: (size: CardSize) => void;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onRefresh: () => void;
  starredBoards: string[];
  /** Issues matching the search or quick filter; null when neither is active. */
  matchCount: number | null;
  selectedCount: number;
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

const separator = (key: string, description: string): SelectItem => ({key, description, rgItemType: List.ListProps.Type.SEPARATOR});

/**
 * Ring UI drops a separator that would open the list, which hides the label of
 * the first section. This filter keeps every separator while nothing is typed
 * and hides them all while filtering; items match on their label.
 */
const sectionedFilter = {
  preserveSeparators: true,
  fn: (item: SelectItem, query: string): boolean => {
    if (item.rgItemType === List.ListProps.Type.SEPARATOR) {
      return query === '';
    }
    return typeof item.label !== 'string' || item.label.toLowerCase().includes(query);
  }
};

/** Prefix of the keys of the copies of the current sprints listed at the top. */
const CURRENT_SPRINT_PREFIX = '__current:';

const sprintKeyOf = (itemKey: string): string =>
  itemKey.startsWith(CURRENT_SPRINT_PREFIX) ? itemKey.slice(CURRENT_SPRINT_PREFIX.length) : itemKey;

const SprintButtonLabel: React.FC<{label: string; range: string}> = ({label, range}) => (
  <span className="sprint-button-label">
    <span className="sprint-button-label__name">{label}</span>
    <span className="sprint-button-label__dates">{range}</span>
  </span>
);

/**
 * Sprint selector items, newest first with their dates. Sprints running today
 * come first under a "Current sprint" label and appear again in the full list.
 */
const buildSprintItems = (values: UniverseValue[], formatDate: DateFormatter, now: number): SelectItem[] => {
  const item = (v: UniverseValue, keyPrefix = ''): SelectItem => {
    const range = sprintDateRange(v, formatDate);
    // The closed selector shows `selectedLabel`. Ring UI types it as a string but renders any node,
    // which lets the chosen sprint keep its dates there, small and after the name.
    const selectedLabel = range ? (<SprintButtonLabel label={v.label} range={range}/>) as unknown as string : v.label;
    return {key: keyPrefix + v.key, label: v.label, description: range, selectedLabel};
  };
  const all: SelectItem[] = [{key: UNSCHEDULED, label: 'Unscheduled', description: 'No sprint set'}, ...sortSprintsByDate(values).map(v => item(v))];
  const current = currentSprints(values, now);
  if (current.length === 0) {
    return all;
  }
  return [
    separator('__current', current.length === 1 ? 'Current sprint' : 'Current sprints'),
    ...current.map(v => item(v, CURRENT_SPRINT_PREFIX)),
    separator('__sprints', 'All sprints'),
    ...all
  ];
};

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
  onOpenQuickFind,
  onCardSize,
  onConnectorsMode,
  onRefresh,
  starredBoards,
  matchCount,
  selectedCount,
  showNewIssue,
  onShowNewIssue,
  onToggleStar
}) => {
  const boardItems = useMemo(() => buildBoardItems(boards, starredBoards, onToggleStar), [boards, starredBoards, onToggleStar]);
  const isStarred = starredBoards.includes(board.id);
  const filterFields = useMemo(
    () => board.cardFields.filter(name => universe.byName.get(name)?.canBeEmpty !== false),
    [board.cardFields, universe]
  );
  const formatDate = useDateFormat();
  const sprintItems = useMemo<SelectItem[]>(() => {
    const fieldName = board.sprints.field?.name;
    const values = fieldName ? (universe.byName.get(fieldName)?.values ?? []) : [];
    return buildSprintItems(values, formatDate, Date.now());
  }, [board.sprints.field, universe, formatDate]);

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <Select
          type={Select.Type.BUTTON}
          label="Select board"
          filter={sectionedFilter}
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
            type={Select.Type.INLINE}
            label="Sprint"
            filter={sectionedFilter}
            data={sprintItems}
            selected={sprintItems.find(item => item.key === (sprint ?? UNSCHEDULED)) ?? sprintItems[0]}
            onChange={(item: SelectItem | null) => onSelectSprint(item && item.key !== UNSCHEDULED ? sprintKeyOf(String(item.key)) : null)}
          />
        </div>
      )}
      <div className="toolbar__group toolbar__group_search">
        <FindMenu fields={filterFields} quickFilter={quickFilter} onQuickFilter={onQuickFilter}/>
        <button type="button" className="toolbar__find-hint" onClick={onOpenQuickFind}>{'Type "/" to find…'}</button>
        {quickFilter && (
          <Tag onRemove={() => onQuickFilter(null)} readOnly={false} className="toolbar__filter-tag">{`No ${quickFilter}`}</Tag>
        )}
        {matchCount !== null && (
          <span className="toolbar__match-count" title="Issues on the board that are highlighted">{`${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}</span>
        )}
        {selectedCount > 0 && <span className="toolbar__selected-count">{`${selectedCount} selected`}</span>}
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
