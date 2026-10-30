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
import linkIcon from '@jetbrains/icons/link';
import searchIcon from '@jetbrains/icons/search';
import settingsIcon from '@jetbrains/icons/settings';
import starEmptyIcon from '@jetbrains/icons/star-empty';
import starFilledIcon from '@jetbrains/icons/star-filled';
import updateIcon from '@jetbrains/icons/update';
import {type BoardConfig, type RelatedBoard, type RowMode, relatedBoardsOf} from '@/common/model/board-config';
import type {CardSize, ConnectorsMode} from '@/common/storage/prefs';
import {orderBoards} from '../model/boardOrder';
import {TIMING_FLAGS, type TimingFlag, timingFilterKey, timingFlagOfFilter} from '../model/timeline';
import type {FieldUniverse} from '../model/fieldUniverse';
import type {UniverseValue} from '../model/fieldUniverse';
import {currentSprints, sortSprintsByDate, sprintDateRange} from '../model/sprints';
import {type BoardPage, orderPages} from '../model/pages';
import {type DateFormatter, useDateFormat} from '../data/useDateFormat';

/** Selector key for issues without a sprint; it is also what an unset sprint (null) shows. */
export const UNSCHEDULED = '';

type FindMenuProps = {
  /** Card fields that may be empty: each offers a "No <field>" highlight. */
  fields: string[];
  /** Time layout: the timing problems that can be highlighted. */
  timingFlags: TimingFlag[];
  quickFilter: string | null;
  onQuickFilter: (field: string | null) => void;
};

/** Radio-style indicator for menu items where only one option can be active. */
const OptionIndicator: React.FC<{selected: boolean}> = ({selected}) => (
  <span className={`option-indicator${selected ? ' option-indicator_selected' : ''}`} aria-hidden="true"/>
);

/** Magnifying glass menu: highlight issues where a card field is unset. */
const FindMenu: React.FC<FindMenuProps> = ({fields, timingFlags, quickFilter, onQuickFilter}) => {
  const timingKeys = timingFlags.map(timingFilterKey);
  const items: SelectItem[] = [
    ...(fields.length > 0 ? [{key: 'highlight-title', label: 'Highlight issues with', rgItemType: List.ListProps.Type.TITLE}] : []),
    ...fields.map(name => ({key: name, label: `No ${name}`, leftNodes: <OptionIndicator selected={quickFilter === name}/>})),
    ...(timingFlags.length > 0 ? [{key: 'timing-title', label: 'Timing', rgItemType: List.ListProps.Type.TITLE}] : []),
    ...timingFlags.map(flag => ({key: timingFilterKey(flag), label: TIMING_FLAGS[flag].label, leftNodes: <OptionIndicator selected={quickFilter === timingFilterKey(flag)}/>}))
  ];
  const empty = fields.length === 0 && timingFlags.length === 0;
  return (
    <Dropdown
      disabled={empty}
      anchor={<Button icon={searchIcon} disabled={empty} title={empty ? 'No card field can be empty' : 'Highlight issues'}/>}
    >
      <PopupMenu
        directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]}
        closeOnSelect
        data={items}
        onSelect={(item: SelectItem) => {
          if (fields.includes(String(item.key)) || timingKeys.includes(String(item.key))) {
            onQuickFilter(item.key === quickFilter ? null : String(item.key));
          }
        }}
      />
    </Dropdown>
  );
};

/** "No Assignee" for a field's quick filter, the highlight's name for a timing one. */
const quickFilterLabel = (quickFilter: string): string => {
  const flag = timingFlagOfFilter(quickFilter);
  return flag ? TIMING_FLAGS[flag].label : `No ${quickFilter}`;
};

const RELATION_OPTIONS: {mode: ConnectorsMode; label: string}[] = [
  {mode: 'none', label: 'None'},
  {mode: 'selected', label: 'For selected issues'},
  {mode: 'all', label: 'All'}
];

const NEW_ISSUE_KEY = 'new-issue';
const GROUP_BY_PARENT_KEY = 'group-by-parent';
const SHORTCUTS_KEY = 'shortcuts';

const boardName = (board: BoardConfig): string => board.name || 'Untitled board';

/** Switches to a related board: a button for one, a small menu for several. */
const RelatedBoardsButton: React.FC<{related: RelatedBoard[]; onSelectBoard: (boardId: string) => void}> = ({related, onSelectBoard}) => {
  if (related.length === 0) {
    return null;
  }
  if (related.length === 1) {
    const [{board}] = related;
    return <Button icon={linkIcon} title={`Switch to related board ${boardName(board)}`} onClick={() => onSelectBoard(board.id)}/>;
  }
  const items: SelectItem[] = [
    {key: 'related-title', label: 'Switch to related board', rgItemType: List.ListProps.Type.TITLE},
    ...related.map(r => ({key: r.board.id, label: boardName(r.board)}))
  ];
  return (
    <Dropdown anchor={<Button icon={linkIcon} title="Switch to a related board"/>}>
      <PopupMenu
        directions={[Directions.BOTTOM_RIGHT, Directions.BOTTOM_LEFT]}
        closeOnSelect
        data={items}
        onSelect={(item: SelectItem) => {
          if (item.key !== 'related-title') {
            onSelectBoard(String(item.key));
          }
        }}
      />
    </Dropdown>
  );
};

type ShowMenuProps = {
  connectorsMode: ConnectorsMode;
  showNewIssue: boolean;
  groupByParent: boolean;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onShowNewIssue: (show: boolean) => void;
  onGroupByParent: (group: boolean) => void;
  onShowShortcuts: () => void;
};

/** "Show" menu: which relation connectors to draw, whether cells offer "New issue…", and whether subtasks are boxed. */
const ShowMenu: React.FC<ShowMenuProps> = ({connectorsMode, showNewIssue, groupByParent, onConnectorsMode, onShowNewIssue, onGroupByParent, onShowShortcuts}) => {
  const items: SelectItem[] = [
    {key: 'relations-title', label: 'Relations', rgItemType: List.ListProps.Type.TITLE},
    ...RELATION_OPTIONS.map(option => ({key: option.mode, label: option.label, checkbox: connectorsMode === option.mode})),
    {key: 'separator', rgItemType: List.ListProps.Type.SEPARATOR},
    {key: NEW_ISSUE_KEY, label: 'New issue controls', checkbox: showNewIssue},
    {key: GROUP_BY_PARENT_KEY, label: 'Group by parent', checkbox: groupByParent},
    {key: 'shortcuts-separator', rgItemType: List.ListProps.Type.SEPARATOR},
    {key: SHORTCUTS_KEY, label: 'Keyboard shortcuts…', rgItemType: List.ListProps.Type.LINK}
  ];
  const relationLabel = RELATION_OPTIONS.find(option => option.mode === connectorsMode)?.label.toLowerCase() ?? '';
  return (
    <Dropdown
      anchor={(
        // Inline like the sprint selector: text with a chevron, no button frame.
        <Button inline dropdown title={`Relations: ${relationLabel} · New issue controls: ${showNewIssue ? 'shown' : 'hidden'}`}>
          Show
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
          } else if (item.key === SHORTCUTS_KEY) {
            onShowShortcuts();
          } else if (item.key === GROUP_BY_PARENT_KEY) {
            onGroupByParent(!groupByParent);
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
  groupByParent: boolean;
  onGroupByParent: (group: boolean) => void;
  /** Opens the list of keyboard shortcuts. */
  onShowShortcuts: () => void;
  onToggleStar: (boardId: string) => void;
  /** Pages to choose from; null for a board without pages. */
  pages: BoardPage[] | null;
  /** Key of the page shown. */
  page: string | null;
  starredPages: string[];
  onSelectPage: (key: string) => void;
  onToggleStarPage: (key: string) => void;
  /** Sprints to choose from (a linked agile board's, or the sprint field's values); null without sprints. */
  sprintValues: UniverseValue[] | null;
  /** Row layouts the board has set up; with both, the toolbar switches between them. */
  rowModes: ('swimlanes' | 'time')[];
  rowMode: RowMode;
  onRowMode: (mode: 'swimlanes' | 'time') => void;
  /** Time layout: timing problems the highlight menu offers. */
  timingFlags: TimingFlag[];
};

const StarToggle: React.FC<{starred: boolean; onToggle: () => void; noun?: string}> = ({starred, onToggle, noun = 'board'}) => (
  <span
    role="button"
    tabIndex={-1}
    className={`board-star${starred ? ' board-star_active' : ''}`}
    title={starred ? `Unstar ${noun}` : `Star ${noun}`}
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
 * Sprint selector items: "Unscheduled", then the sprints newest first with their dates.
 * Sprints running today come first under a "Current sprint" label and appear again in the full list.
 */
const buildSprintItems = (values: UniverseValue[], formatDate: DateFormatter, now: number): SelectItem[] => {
  const item = (v: UniverseValue, keyPrefix = ''): SelectItem => {
    const range = sprintDateRange(v, formatDate);
    // The closed selector shows `selectedLabel`. Ring UI types it as a string but renders any node,
    // which lets the chosen sprint keep its dates there, small and after the name.
    const selectedLabel = range ? (<SprintButtonLabel label={v.label} range={range}/>) as unknown as string : v.label;
    return {key: keyPrefix + v.key, label: v.label, description: range, selectedLabel};
  };
  // A sprint named "Unscheduled" would show next to the entry for no sprint; the entry wins.
  const sprints = sortSprintsByDate(values).filter(v => v.label.trim().toLowerCase() !== 'unscheduled');
  const all: SelectItem[] = [{key: UNSCHEDULED, label: 'Unscheduled', description: 'No sprint set'}, ...sprints.map(v => item(v))];
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

/** Page selector items: "All" (field pages), then starred pages under "Starred", then the others; each in configured order. */
const buildPageItems = (pages: BoardPage[], starredKeys: string[], onToggleStar: (key: string) => void): SelectItem[] => {
  const {pinned, starred, others} = orderPages(pages, starredKeys);
  const item = (p: BoardPage, isStarred: boolean): SelectItem => ({
    key: p.key,
    label: p.label,
    selectedLabel: p.selectedLabel,
    rightNodes: <StarToggle starred={isStarred} noun="page" onToggle={() => onToggleStar(p.key)}/>
  });
  const pinnedItems: SelectItem[] = pinned.map(p => ({key: p.key, label: p.label, selectedLabel: p.selectedLabel}));
  if (starred.length === 0) {
    return [...pinnedItems, ...others.map(p => item(p, false))];
  }
  return [
    ...pinnedItems,
    separator('__starred', 'Starred'),
    ...starred.map(p => item(p, true)),
    ...(others.length > 0 ? [separator('__others', 'Other pages'), ...others.map(p => item(p, false))] : [])
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
  groupByParent,
  onGroupByParent,
  onShowShortcuts,
  onToggleStar,
  pages,
  page,
  starredPages,
  onSelectPage,
  onToggleStarPage,
  sprintValues,
  rowModes,
  rowMode,
  onRowMode,
  timingFlags
}) => {
  const boardItems = useMemo(() => buildBoardItems(boards, starredBoards, onToggleStar), [boards, starredBoards, onToggleStar]);
  const related = useMemo(() => relatedBoardsOf(board, boards), [board, boards]);
  const filterFields = useMemo(
    () => board.cardFields.filter(name => universe.byName.get(name)?.canBeEmpty !== false),
    [board.cardFields, universe]
  );
  const pageItems = useMemo(() => buildPageItems(pages ?? [], starredPages, onToggleStarPage), [pages, starredPages, onToggleStarPage]);
  const formatDate = useDateFormat();
  const sprintItems = useMemo<SelectItem[]>(
    () => buildSprintItems(sprintValues ?? [], formatDate, Date.now()),
    [sprintValues, formatDate]
  );

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
        <RelatedBoardsButton related={related} onSelectBoard={onSelectBoard}/>
        <Button icon={settingsIcon} title="Board settings" onClick={onOpenSettings}/>
        <Button icon={addIcon} title="New board" onClick={onNewBoard}/>
      </div>
      {rowModes.length > 1 && (
        <div className="toolbar__group">
          <ButtonGroup>
            <Button active={rowMode === 'swimlanes'} title="Rows by swimlane fields" onClick={() => onRowMode('swimlanes')}>Swimlanes</Button>
            <Button active={rowMode === 'time'} title="Rows by time" onClick={() => onRowMode('time')}>Time</Button>
          </ButtonGroup>
        </div>
      )}
      {pages && (
        <div className="toolbar__group toolbar__group_page">
          <Select
            type={Select.Type.INLINE}
            label="Page"
            filter={sectionedFilter}
            data={pageItems}
            selected={pageItems.find(item => item.key === page) ?? null}
            onChange={(item: SelectItem | null) => item && onSelectPage(String(item.key))}
          />
        </div>
      )}
      {sprintValues && (
        <div className="toolbar__group toolbar__group_sprint">
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
        <FindMenu fields={filterFields} timingFlags={timingFlags} quickFilter={quickFilter} onQuickFilter={onQuickFilter}/>
        <button type="button" className="toolbar__find-hint" onClick={onOpenQuickFind}>{'Type "/" to find…'}</button>
        {quickFilter && (
          <Tag onRemove={() => onQuickFilter(null)} readOnly={false} className="toolbar__filter-tag">{quickFilterLabel(quickFilter)}</Tag>
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
          groupByParent={groupByParent}
          onConnectorsMode={onConnectorsMode}
          onShowNewIssue={onShowNewIssue}
          onGroupByParent={onGroupByParent}
          onShowShortcuts={onShowShortcuts}
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
