import React, {useMemo, useRef} from 'react';
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
import moreOptionsIcon from '@jetbrains/icons/more-options';
import searchIcon from '@jetbrains/icons/search';
import settingsIcon from '@jetbrains/icons/settings';
import starEmptyIcon from '@jetbrains/icons/star-empty';
import starFilledIcon from '@jetbrains/icons/star-filled';
import updateIcon from '@jetbrains/icons/update';
import {type BoardConfig, type RelatedBoard, type RowMode, relatedBoardsOf} from '@/common/model/board-config';
import {type CardSize, type ConnectorsMode, GANTT_ZOOMS, type GanttZoom} from '@/common/storage/prefs';
import {tierFor} from '../model/ganttScale';
import {orderBoards} from '../model/boardOrder';
import {TIMING_FLAGS, type TimingFlag, timingFilterKey, timingFlagOfFilter} from '../model/timeline';
import type {FieldUniverse} from '../model/fieldUniverse';
import type {UniverseValue} from '../model/fieldUniverse';
import {currentSprints, sortSprintsByDate, sprintDateRange} from '../model/sprints';
import {type BoardPage, orderPages} from '../model/pages';
import {type DateFormatter, useDateFormat} from '../data/useDateFormat';
import {type Density, DENSITIES, useToolbarDensity} from './useToolbarDensity';

/** Selector key for issues without a sprint; it is also what an unset sprint (null) shows. */
export const UNSCHEDULED = '';

type FindMenuProps = {
  /** Compact toolbar: the menu also opens the find box, whose hint is folded away. */
  onOpenQuickFind?: () => void;
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
const FIND_KEY = 'find';

const FindMenu: React.FC<FindMenuProps> = ({onOpenQuickFind, fields, timingFlags, quickFilter, onQuickFilter}) => {
  const timingKeys = timingFlags.map(timingFilterKey);
  const items: SelectItem[] = [
    ...(onOpenQuickFind ? [{key: FIND_KEY, label: 'Find by ID or summary…', description: '/', rgItemType: List.ListProps.Type.LINK}] : []),
    ...(onOpenQuickFind && (fields.length > 0 || timingFlags.length > 0) ? [{key: 'find-separator', rgItemType: List.ListProps.Type.SEPARATOR}] : []),
    ...(fields.length > 0 ? [{key: 'highlight-title', label: 'Highlight issues with', rgItemType: List.ListProps.Type.TITLE}] : []),
    ...fields.map(name => ({key: name, label: `No ${name}`, leftNodes: <OptionIndicator selected={quickFilter === name}/>})),
    ...(timingFlags.length > 0 ? [{key: 'timing-title', label: 'Timing', rgItemType: List.ListProps.Type.TITLE}] : []),
    ...timingFlags.map(flag => ({key: timingFilterKey(flag), label: TIMING_FLAGS[flag].label, leftNodes: <OptionIndicator selected={quickFilter === timingFilterKey(flag)}/>}))
  ];
  const empty = fields.length === 0 && timingFlags.length === 0 && !onOpenQuickFind;
  let title = onOpenQuickFind ? 'Find (/) and highlight issues' : 'Highlight issues';
  if (empty) {
    title = 'No card field can be empty';
  }
  return (
    <Dropdown
      disabled={empty}
      anchor={<Button icon={searchIcon} disabled={empty} title={title}/>}
    >
      <PopupMenu
        directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]}
        closeOnSelect
        data={items}
        onSelect={(item: SelectItem) => {
          if (item.key === FIND_KEY) {
            onOpenQuickFind?.();
          } else if (fields.includes(String(item.key)) || timingKeys.includes(String(item.key))) {
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

const ROW_MODE_BUTTONS: {mode: Exclude<RowMode, 'none'>; label: string; title: string}[] = [
  {mode: 'swimlanes', label: 'Swimlanes', title: 'Rows by swimlane fields'},
  {mode: 'time', label: 'Time', title: 'Rows by time'},
  {mode: 'gantt', label: 'Gantt', title: 'Plans, due dates and workload on a timeline'}
];

const ZOOM_LABELS: Record<GanttZoom, string> = {day: 'Days', week: 'Weeks', month: 'Months', quarter: 'Quarters'};

type MoreMenuProps = {
  density: Density;
  connectorsMode: ConnectorsMode;
  showNewIssue: boolean;
  groupByParent: boolean;
  cardSize: CardSize;
  status: string;
  loading: boolean;
  onConnectorsMode: (mode: ConnectorsMode) => void;
  onShowNewIssue: (show: boolean) => void;
  onGroupByParent: (group: boolean) => void;
  onCardSize: (size: CardSize) => void;
  onRefresh: () => void;
  onShowShortcuts: () => void;
};

const REFRESH_KEY = 'refresh';
const CARD_SIZE_KEYS: Record<string, CardSize> = {'card-small': 'small', 'card-normal': 'normal'};

/** Whether a density folds the card size, and the status with Refresh, into the "⋯" menu. */
const folds = (density: Density, from: Density): boolean => DENSITIES.indexOf(density) >= DENSITIES.indexOf(from);

const moreItems = ({density, connectorsMode, showNewIssue, groupByParent, cardSize, status, loading}: MoreMenuProps): SelectItem[] => [
  ...(folds(density, 'tight')
    ? [
      {key: 'status-title', label: status || 'Board', rgItemType: List.ListProps.Type.TITLE},
      {key: REFRESH_KEY, label: 'Refresh', rgItemType: List.ListProps.Type.LINK, disabled: loading},
      {key: 'status-separator', rgItemType: List.ListProps.Type.SEPARATOR}
    ]
    : []),
  {key: 'relations-title', label: 'Relations', rgItemType: List.ListProps.Type.TITLE},
  ...RELATION_OPTIONS.map(option => ({key: option.mode, label: option.label, checkbox: connectorsMode === option.mode})),
  {key: 'separator', rgItemType: List.ListProps.Type.SEPARATOR},
  {key: NEW_ISSUE_KEY, label: 'New issue controls', checkbox: showNewIssue},
  {key: GROUP_BY_PARENT_KEY, label: 'Group by parent', checkbox: groupByParent},
  ...(folds(density, 'narrow')
    ? [
      {key: 'card-title', label: 'Card size', rgItemType: List.ListProps.Type.TITLE},
      {key: 'card-small', label: 'Small', checkbox: cardSize === 'small'},
      {key: 'card-normal', label: 'Normal', checkbox: cardSize === 'normal'}
    ]
    : []),
  {key: 'shortcuts-separator', rgItemType: List.ListProps.Type.SEPARATOR},
  {key: SHORTCUTS_KEY, label: 'Keyboard shortcuts…', rgItemType: List.ListProps.Type.LINK}
];

/**
 * "⋯" menu: which relation connectors to draw, "New issue…" controls, subtask boxes and the
 * shortcuts; on a narrow toolbar also the card size, and on the tightest the status and Refresh.
 */
const MoreMenu: React.FC<MoreMenuProps> = props => {
  const {connectorsMode, showNewIssue, groupByParent, onConnectorsMode, onShowNewIssue, onGroupByParent, onCardSize, onRefresh, onShowShortcuts} = props;
  const relationLabel = RELATION_OPTIONS.find(option => option.mode === connectorsMode)?.label.toLowerCase() ?? '';
  const onSelect = (item: SelectItem) => {
    const key = String(item.key);
    if (key === NEW_ISSUE_KEY) {
      onShowNewIssue(!showNewIssue);
    } else if (key === SHORTCUTS_KEY) {
      onShowShortcuts();
    } else if (key === GROUP_BY_PARENT_KEY) {
      onGroupByParent(!groupByParent);
    } else if (key === REFRESH_KEY) {
      onRefresh();
    } else if (CARD_SIZE_KEYS[key]) {
      onCardSize(CARD_SIZE_KEYS[key]);
    } else if (RELATION_OPTIONS.some(option => option.mode === key)) {
      onConnectorsMode(key as ConnectorsMode);
    }
  };
  return (
    <Dropdown anchor={<Button icon={moreOptionsIcon} title={`More · Relations: ${relationLabel} · New issue controls: ${showNewIssue ? 'shown' : 'hidden'}`}/>}>
      <PopupMenu directions={[Directions.BOTTOM_LEFT, Directions.TOP_LEFT]} closeOnSelect={false} data={moreItems(props)} onSelect={onSelect}/>
    </Dropdown>
  );
};

type RowModeProps = {density: Density; rowModes: Exclude<RowMode, 'none'>[]; rowMode: RowMode; onRowMode: (mode: Exclude<RowMode, 'none'>) => void};

/** Swimlanes, Time and Gantt: buttons, or a dropdown on a compact toolbar. */
const RowModeSwitch: React.FC<RowModeProps> = ({density, rowModes, rowMode, onRowMode}) => {
  const buttons = ROW_MODE_BUTTONS.filter(button => rowModes.includes(button.mode));
  if (folds(density, 'compact')) {
    const items: SelectItem[] = buttons.map(button => ({key: button.mode, label: button.label, description: button.title}));
    return (
      <Select
        type={Select.Type.INLINE}
        label="Layout"
        data={items}
        selected={items.find(item => item.key === rowMode) ?? null}
        onChange={(item: SelectItem | null) => item && onRowMode(item.key as Exclude<RowMode, 'none'>)}
      />
    );
  }
  return (
    <ButtonGroup>
      {buttons.map(button => (
        <Button key={button.mode} active={rowMode === button.mode} title={button.title} onClick={() => onRowMode(button.mode)}>{button.label}</Button>
      ))}
    </ButtonGroup>
  );
};

type GanttControlsProps = {density: Density; gantt: NonNullable<Props['gantt']>};

const ZOOM_TITLE = 'Zoom freely with Ctrl+scroll (or pinch) over the chart, or + and −.';

/** The Gantt time scale presets (buttons, or a dropdown on a compact toolbar), Fit and Today. */
const GanttControls: React.FC<GanttControlsProps> = ({density, gantt}) => {
  const tier = tierFor(gantt.pxPerDay);
  const items: SelectItem[] = GANTT_ZOOMS.map(zoom => ({key: zoom, label: ZOOM_LABELS[zoom]}));
  return (
    <>
      {folds(density, 'compact') ? (
        <Select
          type={Select.Type.INLINE}
          label="Time scale"
          data={items}
          selected={items.find(item => item.key === tier) ?? null}
          onChange={(item: SelectItem | null) => item && gantt.onPreset(item.key as GanttZoom)}
        />
      ) : (
        <ButtonGroup>
          {GANTT_ZOOMS.map(zoom => (
            <Button key={zoom} active={tier === zoom} title={`Time scale in ${ZOOM_LABELS[zoom].toLowerCase()}. ${ZOOM_TITLE}`} onClick={() => gantt.onPreset(zoom)}>
              {ZOOM_LABELS[zoom]}
            </Button>
          ))}
        </ButtonGroup>
      )}
      <Button title="Zoom to show every issue" onClick={gantt.onFit}>Fit</Button>
      <Button title="Scroll to today" onClick={gantt.onToday}>Today</Button>
    </>
  );
};

type SearchGroupProps = {
  density: Density;
  fields: string[];
  timingFlags: TimingFlag[];
  quickFilter: string | null;
  onQuickFilter: (field: string | null) => void;
  onOpenQuickFind: () => void;
  matchCount: number | null;
  selectedCount: number;
};

/** Highlight menu, the find hint (folded into the menu when space is short), the active highlight and the counts. */
const SearchGroup: React.FC<SearchGroupProps> = ({density, fields, timingFlags, quickFilter, onQuickFilter, onOpenQuickFind, matchCount, selectedCount}) => {
  const full = density === 'full';
  const narrow = folds(density, 'narrow');
  const matches = matchCount === 1 ? 'match' : 'matches';
  return (
    <div className="toolbar__group toolbar__group_search">
      <FindMenu onOpenQuickFind={full ? undefined : onOpenQuickFind} fields={fields} timingFlags={timingFlags} quickFilter={quickFilter} onQuickFilter={onQuickFilter}/>
      {full && <button type="button" className="toolbar__find-hint" onClick={onOpenQuickFind}>{'Type "/" to find…'}</button>}
      {quickFilter && <Tag onRemove={() => onQuickFilter(null)} readOnly={false} className="toolbar__filter-tag">{quickFilterLabel(quickFilter)}</Tag>}
      {matchCount !== null && (
        <span className="toolbar__match-count" title={`${matchCount} highlighted on the board`}>{narrow ? String(matchCount) : `${matchCount} ${matches}`}</span>
      )}
      {selectedCount > 0 && <span className="toolbar__selected-count" title={`${selectedCount} selected`}>{narrow ? `${selectedCount} ✓` : `${selectedCount} selected`}</span>}
    </div>
  );
};

/** The loader, the "N issues" status and Refresh, just left of "⋯"; at the tightest only the loader stays. */
const StatusGroup: React.FC<{loading: boolean; folded: boolean; status: string; onRefresh: () => void}> = ({loading, folded, status, onRefresh}) => (
  <>
    {loading && <LoaderInline/>}
    {!folded && <span className="toolbar__status">{status}</span>}
    {!folded && <Button icon={updateIcon} title="Refresh" onClick={onRefresh} disabled={loading}/>}
  </>
);

/** What changes the toolbar's width besides the window, as one string. */
const contentKey = (parts: unknown[]): string => parts.map(part => String(part ?? '')).join('|');

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
  /** Row layouts the board has set up; with several, the toolbar switches between them. */
  rowModes: Exclude<RowMode, 'none'>[];
  rowMode: RowMode;
  onRowMode: (mode: Exclude<RowMode, 'none'>) => void;
  /** Gantt layout: its zoom presets, "Fit" and "Today"; null in other layouts. */
  gantt: {pxPerDay: number; onPreset: (zoom: GanttZoom) => void; onFit: () => void; onToday: () => void} | null;
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
  gantt,
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

  const ref = useRef<HTMLDivElement | null>(null);
  // What changes the toolbar's width other than the window: measure afresh when it does.
  const content = contentKey([board.id, rowModes.join(), rowMode, Boolean(gantt), pages?.length, page, sprint, quickFilter]);
  const density = useToolbarDensity(ref, content);
  const narrow = folds(density, 'narrow');

  return (
    <div className={`toolbar toolbar_${density}`} ref={ref}>
      <div className="toolbar__group toolbar__group_board">
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
          <RowModeSwitch density={density} rowModes={rowModes} rowMode={rowMode} onRowMode={onRowMode}/>
        </div>
      )}
      {gantt && (
        <div className="toolbar__group">
          <GanttControls density={density} gantt={gantt}/>
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
      <SearchGroup
        density={density}
        fields={filterFields}
        timingFlags={timingFlags}
        quickFilter={quickFilter}
        onQuickFilter={onQuickFilter}
        onOpenQuickFind={onOpenQuickFind}
        matchCount={matchCount}
        selectedCount={selectedCount}
      />
      {!narrow && (
        <div className="toolbar__group">
          <ButtonGroup>
            <Button active={cardSize === 'small'} onClick={() => onCardSize('small')}>Small</Button>
            <Button active={cardSize === 'normal'} onClick={() => onCardSize('normal')}>Normal</Button>
          </ButtonGroup>
        </div>
      )}
      <div className="toolbar__group toolbar__group_status">
        <StatusGroup loading={loading} folded={density === 'tight'} status={status} onRefresh={onRefresh}/>
        <MoreMenu
          density={density}
          connectorsMode={connectorsMode}
          showNewIssue={showNewIssue}
          groupByParent={groupByParent}
          cardSize={cardSize}
          status={status}
          loading={loading}
          onConnectorsMode={onConnectorsMode}
          onShowNewIssue={onShowNewIssue}
          onGroupByParent={onGroupByParent}
          onCardSize={onCardSize}
          onRefresh={onRefresh}
          onShowShortcuts={onShowShortcuts}
        />
      </div>
    </div>
  );
};
