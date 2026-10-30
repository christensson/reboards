import React, {useMemo} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import confirm from '@jetbrains/ring-ui-built/components/confirm-service/confirm-service';
import addIcon from '@jetbrains/icons/add';
import {FieldSelect} from '@/common/components/FieldSelect';
import {QueryEditor} from '@/common/components/QueryEditor';
import {SortableValueList} from '@/common/components/SortableValueList';
import {
  type BoardConfig,
  NO_VALUE_PAGE,
  PAGE_FIELD_KINDS,
  type PageQuery,
  type PagesConfig,
  type PagesMode,
  generateId,
  ownSprintField
} from '@/common/model/board-config';
import {youtrack} from '../data/api';
import type {FieldUniverse} from '../model/fieldUniverse';
import {boardPages} from '../model/pages';
import {ListEditor} from './ListEditor';

type Props = {
  draft: BoardConfig;
  universe: FieldUniverse;
  readOnly: boolean;
  patch: (changes: Partial<BoardConfig>) => void;
};

const MODES: {key: PagesMode; label: string; description: string}[] = [
  {key: 'none', label: 'No pages', description: 'The board has no page selector'},
  {key: 'field', label: 'Pages from a field', description: 'One page per value of a field'},
  {key: 'queries', label: 'Pages from queries', description: 'Named pages, each with its own query'}
];

const newPage = (index: number, query = ''): PageQuery => ({id: generateId(), name: `Page ${index + 1}`, query});

/** Query pages replace the board query and the linked agile board; switching to them clears both, after asking. */
const switchToQueries = async (draft: BoardConfig, patch: Props['patch']): Promise<void> => {
  const replaced = Boolean(draft.agileSource) || Boolean(draft.query.trim());
  if (replaced) {
    try {
      await confirm({
        text: 'Query pages replace the board query and the linked agile board. Clear them?',
        description: draft.query.trim() ? 'The current query becomes the first page.' : undefined,
        confirmLabel: 'Use query pages',
        rejectLabel: 'Cancel'
      });
    } catch {
      return;
    }
  }
  const pages = draft.pages.pages.length > 0 ? draft.pages.pages : [newPage(0, draft.query.trim())];
  patch({pages: {...draft.pages, mode: 'queries', pages}, query: '', agileSource: null});
};

type FieldPagesProps = Props & {setPages: (changes: Partial<PagesConfig>) => void};

/** The page field, and which of its values are pages. */
const FieldPages: React.FC<FieldPagesProps> = ({draft, universe, readOnly, setPages}) => {
  const {field, values} = draft.pages;
  const sprintField = ownSprintField(draft);
  // Every page but "All": the values shown when nothing is restricted, else the chosen ones.
  const allPages = useMemo(
    () => (boardPages({...draft, pages: {...draft.pages, values: []}}, universe) ?? []).filter(p => !p.pinned),
    [draft, universe]
  );
  const options = useMemo(() => {
    const resolved = field ? universe.byName.get(field.name) : undefined;
    return [
      ...(resolved?.values ?? []).map(v => ({key: v.key, label: v.label})),
      {key: NO_VALUE_PAGE, label: `No ${field?.name ?? 'value'}`}
    ];
  }, [field, universe]);
  return (
    <>
      <div className="settings-field">
        <span className="settings-field__label">Page field</span>
        <FieldSelect
          universe={universe}
          kinds={PAGE_FIELD_KINDS}
          excludeNames={sprintField ? [sprintField.name] : []}
          value={field}
          disabled={readOnly}
          onChange={next => setPages({field: next, values: []})}
        />
        <span className="settings-field__help">{'The selector offers "All" and a page per value; titles are the values.'}</span>
      </div>
      {field && (
        <div className="settings-field">
          <Toggle
            checked={values.length === 0}
            disabled={readOnly}
            onChange={event => setPages({values: event.target.checked ? [] : allPages.map(p => p.key)})}
          >
            Show every value
          </Toggle>
          {values.length > 0 && (
            <ListEditor
              values={values}
              options={options}
              addLabel="Add value"
              emptyMessage="No values"
              disabled={readOnly}
              onChange={next => setPages({values: next})}
            />
          )}
        </div>
      )}
    </>
  );
};

/** One page per row: its name and query; rows can be reordered and removed. */
const QueryPages: React.FC<FieldPagesProps> = ({draft, readOnly, setPages}) => {
  const {pages} = draft.pages;
  const update = (id: string, changes: Partial<PageQuery>) => setPages({pages: pages.map(p => (p.id === id ? {...p, ...changes} : p))});
  return (
    <div className="settings-field">
      <span className="settings-field__label">Pages</span>
      <SortableValueList
        items={pages.map(p => ({id: p.id, label: p.name, page: p}))}
        disabled={readOnly}
        onReorder={ids => setPages({pages: ids.map(id => pages.find(p => p.id === id)).filter((p): p is PageQuery => Boolean(p))})}
        onRemove={id => setPages({pages: pages.filter(p => p.id !== id)})}
        emptyMessage="No pages"
        renderItem={({page}) => (
          <span className="pages-editor__row">
            <Input
              size={Size.S}
              value={page.name}
              disabled={readOnly}
              placeholder="Name"
              onChange={event => update(page.id, {name: event.target.value})}
            />
            <QueryEditor
              className="pages-editor__query"
              value={page.query}
              disabled={readOnly}
              searchAssist={youtrack.searchAssist}
              placeholder="e.g. Type: Bug"
              onChange={query => update(page.id, {query})}
            />
          </span>
        )}
      />
      <div className="settings-actions">
        <Button icon={addIcon} disabled={readOnly} onClick={() => setPages({pages: [...pages, newPage(pages.length)]})}>Add page</Button>
      </div>
      <span className="settings-field__help">Each page shows the issues of the board projects that match its query, in the selected sprint.</span>
    </div>
  );
};

/** The page selector: none, pages from a field's values, or named query pages. */
export const PagesSection: React.FC<Props> = props => {
  const {draft, readOnly, patch} = props;
  const setPages = (changes: Partial<PagesConfig>) => patch({pages: {...draft.pages, ...changes}});
  const data = useMemo<SelectItem[]>(() => MODES.map(m => ({key: m.key, label: m.label, description: m.description})), []);
  const onMode = (mode: PagesMode) => {
    if (mode === 'queries') {
      switchToQueries(draft, patch);
    } else {
      setPages({mode});
    }
  };
  return (
    <>
      <div className="settings-field">
        <span className="settings-field__label">Page selector</span>
        <Select
          type={Select.Type.BUTTON}
          disabled={readOnly}
          data={data}
          selected={data.find(item => item.key === draft.pages.mode) ?? data[0]}
          onChange={(item: SelectItem | null) => item && item.key !== draft.pages.mode && onMode(item.key as PagesMode)}
        />
        <span className="settings-field__help">Pages split the board into views picked in the toolbar; everyone can star their favorite pages.</span>
      </div>
      {draft.pages.mode === 'field' && <FieldPages {...props} setPages={setPages}/>}
      {draft.pages.mode === 'queries' && <QueryPages {...props} setPages={setPages}/>}
    </>
  );
};
