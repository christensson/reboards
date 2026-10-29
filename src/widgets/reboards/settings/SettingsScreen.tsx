import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';
import confirm from '@jetbrains/ring-ui-built/components/confirm-service/confirm-service';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import duplicateIcon from '@jetbrains/icons/duplicate';
import {FieldSelect} from '@/common/components/FieldSelect';
import {ProjectsSelect} from '@/common/components/ProjectsSelect';
import {QueryEditor} from '@/common/components/QueryEditor';
import {type BoardConfig, DYNAMIC_KINDS, type FieldKind, type FieldRef, canBeDynamic, isDynamicField, isDynamicKind, validateBoardConfig} from '@/common/model/board-config';
import {type MergeChoice, type MergeGroup, mergeBoards, resolveMerge} from '@/common/model/board-merge';
import {currentUserLogin} from '@/common/youtrack/host';
import {composeQuery} from '@/common/youtrack/query';
import {errorMessage} from '@/common/youtrack/rest';
import type {YtProject} from '@/common/youtrack/types';
import {api, youtrack} from '../data/api';
import {useBoardReference} from '../data/useBoardReference';
import type {SaveResult} from '../data/useBoards';
import {
  CARD_COLOR_FIELD_KINDS,
  COLUMN_FIELD_KINDS,
  type FieldUniverse,
  SPRINT_FIELD_KINDS,
  applyUniverseDefaults,
  defaultColumns
} from '../model/fieldUniverse';
import {ColumnsEditor} from './ColumnsEditor';
import {AsDynamicToggle, DynamicOptionsEditor} from './DynamicOptionsEditor';
import {ListEditor} from './ListEditor';
import {MergeDialog, type PendingMerge} from './MergeDialog';
import {OwnerField} from './OwnerField';
import {RelatedBoardsField} from './RelatedBoardsField';
import {SwimlanesSection} from './SwimlanesSection';

type Props = {
  board: BoardConfig;
  /** Boards the user can see, to choose related boards from. */
  boards: BoardConfig[];
  isNew: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** System administrator: may share any board. */
  isAdmin: boolean;
  /** `baseVersion` is the version the edit started from; it is omitted for a new board. */
  onSave: (board: BoardConfig, baseVersion?: number) => Promise<SaveResult>;
  onDelete: (id: string) => Promise<void>;
  /** Hands the board over; whoever may delete a board may also transfer it. */
  onTransfer: (id: string, login: string) => Promise<void>;
  onCancel: () => void;
  onSaved: (board: BoardConfig) => void;
};

const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
  <section className="settings-section">
    <h3 className="settings-section__title">{title}</h3>
    {children}
  </section>
);

type FooterProps = {
  creating: boolean;
  duplicating: boolean;
  readOnly: boolean;
  canDelete: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

const SettingsFooter: React.FC<FooterProps> = ({creating, duplicating, readOnly, canDelete, saving, onSave, onCancel, onDuplicate, onDelete}) => (
  <div className="settings-footer">
    <Button primary disabled={readOnly || saving} loader={saving} onClick={onSave}>{creating ? 'Create board' : 'Save'}</Button>
    <Button onClick={onCancel}>{readOnly ? 'Back' : 'Cancel'}</Button>
    {!creating && (
      <Button icon={duplicateIcon} disabled={saving} title="Copy these settings into a new, unsaved board" onClick={onDuplicate}>
        Duplicate
      </Button>
    )}
    {!creating && <Button danger disabled={!canDelete || saving} onClick={onDelete}>Delete board</Button>}
    {duplicating && <span className="settings-footer__note">The copy is not stored until you create it.</span>}
  </div>
);

type ShareFieldProps = {
  shared: boolean;
  /** Only system admins and project admins see the switch. */
  showToggle: boolean;
  /** The user administers every board project (or is a system admin). */
  canShare: boolean;
  readOnly: boolean;
  onChange: (shared: boolean) => void;
};

/** Sharing needs admin rights in every board project, unless the user is a system admin. */
const canShareProjects = (projects: BoardConfig['projects'], isAdmin: boolean, adminProjects: Set<string>): boolean =>
  isAdmin || (projects.length > 0 && projects.every(p => adminProjects.has(p.shortName)));

const ShareField: React.FC<ShareFieldProps> = ({shared, showToggle, canShare, readOnly, onChange}) => {
  if (!showToggle) {
    return shared ? <span className="settings-field__help">Shared with everyone who can read all of its projects.</span> : null;
  }
  return (
    <div className="settings-field">
      <Toggle checked={shared} disabled={readOnly || (!shared && !canShare)} onChange={event => onChange(event.target.checked)}>
        Shared with all users
      </Toggle>
      <span className="settings-field__help">
        {canShare || shared
          ? 'Shared boards are visible to everyone who can read all of their projects. Personal boards are visible only to you.'
          : 'To share this board you need admin rights in all of its projects.'}
      </span>
    </div>
  );
};

/** On a sprint board the sprint field selects the issues, so it is not offered for columns or swimlanes. */
const sprintExclusions = (board: BoardConfig): string[] => (board.sprints.enabled && board.sprints.field ? [board.sprints.field.name] : []);

type ColumnValuesProps = {
  draft: BoardConfig;
  kind: FieldKind | 'other';
  universe: FieldUniverse;
  readOnly: boolean;
  patch: (changes: Partial<BoardConfig>) => void;
};

/** Switches an enum column field between configured columns and columns taken from the issues. */
const setColumnsDynamic = async (draft: BoardConfig, universe: FieldUniverse, asDynamic: boolean, patch: ColumnValuesProps['patch']): Promise<void> => {
  if (asDynamic && draft.columns.length > 0) {
    try {
      await confirm({text: 'This removes the configured columns. Continue?', confirmLabel: 'Remove columns', rejectLabel: 'Cancel'});
    } catch {
      return;
    }
  }
  patch({
    // Enums have a natural order, such as priorities.
    columnOptions: {...draft.columnOptions, asDynamic, ...(asDynamic ? {sort: 'order' as const} : {})},
    columns: asDynamic ? [] : defaultColumns(universe, draft.columnField.name),
    ignoredValues: []
  });
};

const ColumnValuesEditor: React.FC<ColumnValuesProps> = ({draft, kind, universe, readOnly, patch}) =>
  isDynamicField(kind, draft.columnOptions) ? (
    <DynamicOptionsEditor kind={kind} options={draft.columnOptions} columns disabled={readOnly} onChange={columnOptions => patch({columnOptions})}/>
  ) : (
    <ColumnsEditor
      fieldName={draft.columnField.name}
      universe={universe}
      columns={draft.columns}
      ignoredValues={draft.ignoredValues}
      disabled={readOnly}
      onChange={(columns, ignoredValues) => patch({columns, ignoredValues})}
    />
  );

/** Dynamic column fields take their columns from the issues; stable ones get configured columns. */
const ColumnValues: React.FC<ColumnValuesProps> = ({draft, kind, universe, readOnly, patch}) => (
  <>
    {canBeDynamic(kind) && (
      <AsDynamicToggle checked={draft.columnOptions.asDynamic} columns disabled={readOnly} onChange={on => setColumnsDynamic(draft, universe, on, patch)}/>
    )}
    <ColumnValuesEditor draft={draft} kind={kind} universe={universe} readOnly={readOnly} patch={patch}/>
  </>
);

/** Asks whether to store the draft as a new board after the edited one was deleted meanwhile. */
const confirmRecreate = async (): Promise<boolean> => {
  try {
    await confirm({
      text: 'This board was deleted while you were editing it',
      description: 'Create it again as a new board with your settings?',
      confirmLabel: 'Create board',
      rejectLabel: 'Cancel'
    });
    return true;
  } catch {
    return false;
  }
};

const screenTitle = (isNew: boolean, duplicating: boolean, name: string): string => {
  if (isNew) {
    return 'New board';
  }
  return duplicating ? `New board (copy of ${name})` : `Board settings: ${name}`;
};

export const SettingsScreen: React.FC<Props> = ({board, boards, isNew, canEdit, canDelete, isAdmin, onSave, onDelete, onTransfer, onCancel, onSaved}) => {
  const [draft, setDraft] = useState<BoardConfig>(board);
  // The stored board the draft started from; the board prop follows later saves, so it cannot serve as the merge base.
  const [base, setBase] = useState<BoardConfig>(board);
  const [merge, setMerge] = useState<PendingMerge | null>(null);
  const [projects, setProjects] = useState<YtProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [adminProjects, setAdminProjects] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicating, setDuplicating] = useState(false);
  const creating = isNew || duplicating;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reference = useBoardReference(draft.projects);
  const readOnly = !canEdit && !duplicating;
  const sprintFieldNames = sprintExclusions(draft);
  const columnKind = reference.universe.byName.get(draft.columnField.name)?.kind ?? draft.columnField.kind;
  const showShareToggle = isAdmin || adminProjects.size > 0;
  const canShareDraft = canShareProjects(draft.projects, isAdmin, adminProjects);
  const [defaultsApplied, setDefaultsApplied] = useState(!isNew);

  useEffect(() => {
    youtrack
      .getProjects()
      .then(async list => {
        setProjects([...list].sort((a, b) => a.name.localeCompare(b.name)));
        const res = await api.global.projects.permissions.POST({shortNames: list.map(p => p.shortName)});
        setAdminProjects(new Set(res.adminShortNames));
      })
      .catch(error => alertService.error(`Could not load projects: ${errorMessage(error)}`))
      .finally(() => setProjectsLoading(false));
  }, []);

  // A new board gets defaults as soon as its projects' fields are known.
  useEffect(() => {
    if (!defaultsApplied && draft.projects.length > 0 && !reference.loading && reference.universe.fields.length > 0) {
      setDraft(prev => applyUniverseDefaults(prev, reference.universe));
      setDefaultsApplied(true);
    }
  }, [defaultsApplied, draft.projects.length, reference.loading, reference.universe]);

  const patch = useCallback((changes: Partial<BoardConfig>) => setDraft(prev => ({...prev, ...changes})), []);

  const onColumnField = useCallback(
    async (field: FieldRef | null) => {
      if (!field) {
        return;
      }
      if (draft.columns.length > 0 && field.name !== draft.columnField.name) {
        try {
          await confirm({text: 'Changing the column field resets the columns. Continue?', confirmLabel: 'Reset columns', rejectLabel: 'Cancel'});
        } catch {
          return;
        }
      }
      // Dynamic fields take their columns from the issues; only stable fields get configured columns.
      const dynamic = isDynamicKind(reference.universe.byName.get(field.name)?.kind ?? field.kind);
      // A new field starts as what its kind is: an enum's "treat as changing" choice does not carry over.
      patch({
        columnField: field,
        columns: dynamic ? [] : defaultColumns(reference.universe, field.name),
        ignoredValues: [],
        columnOptions: {...draft.columnOptions, asDynamic: false}
      });
    },
    [draft.columns.length, draft.columnField.name, draft.columnOptions, patch, reference.universe]
  );

  const save = useCallback(async () => {
    const problems = validateBoardConfig(draft);
    if (problems.length > 0) {
      setErrors(problems.map(p => p.message));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      let result = await onSave(draft, creating ? undefined : base.version);
      if (result.kind === 'gone' && (await confirmRecreate())) {
        result = await onSave({...draft, id: '', version: 0});
      }
      if (result.kind === 'saved') {
        alertService.successMessage(`Board "${result.board.name}" saved`);
        onSaved(result.board);
      } else if (result.kind === 'conflict') {
        setMerge({result: mergeBoards(base, draft, result.current), mine: draft, theirs: result.current});
      } else {
        setErrors(['This board was deleted by someone else']);
      }
    } catch (error) {
      setErrors([errorMessage(error)]);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, creating, base, onSaved]);

  const applyMerge = useCallback((choices: Partial<Record<MergeGroup, MergeChoice>>) => {
    if (!merge) {
      return;
    }
    const merged = resolveMerge(merge.result, merge.theirs, choices);
    setDraft(merged);
    setBase(merge.theirs);
    setMerge(null);
    setErrors(validateBoardConfig(merged).map(p => p.message));
  }, [merge]);

  const remove = useCallback(async () => {
    try {
      await confirm({text: `Delete board "${board.name}"? This cannot be undone.`, confirmLabel: 'Delete', rejectLabel: 'Cancel'});
    } catch {
      return;
    }
    try {
      await onDelete(board.id);
      alertService.successMessage('Board deleted');
      onCancel();
    } catch (error) {
      setErrors([errorMessage(error)]);
    }
  }, [board.id, board.name, onDelete, onCancel]);

  // Copies the current values into a new, unsaved board; only "Create board" stores it.
  const duplicate = useCallback(() => {
    // The copy starts personal: sharing it is a separate decision, and may need admin rights.
    setDraft(prev => ({...prev, id: '', name: `${prev.name} (copy)`, owner: currentUserLogin() || prev.owner, shared: false, createdAt: 0, updatedAt: 0, version: 0}));
    setDuplicating(true);
    setErrors([]);
    rootRef.current?.scrollIntoView({block: 'start'});
  }, []);

  const cancel = useCallback(() => {
    if (duplicating) {
      setDraft(board);
      setDuplicating(false);
      setErrors([]);
      return;
    }
    onCancel();
  }, [duplicating, board, onCancel]);


  const sampleQuery = useMemo(
    () =>
      composeQuery({
        projects: draft.projects.map(p => p.shortName),
        query: draft.query,
        sprintField: draft.sprints.enabled ? draft.sprints.field?.name : null,
        sprint: draft.sprints.enabled && draft.sprints.field ? '<sprint>' : null
      }),
    [draft.projects, draft.query, draft.sprints]
  );

  const cardFieldOptions = useMemo(
    () => reference.universe.fields.map(f => ({key: f.name, label: f.name, description: f.kind === 'other' ? f.typeId : f.kind})),
    [reference.universe]
  );
  const linkTypeOptions = useMemo(
    () => reference.linkTypes.map(t => ({key: t.name, label: t.name, description: t.directed ? `${t.sourceToTarget} / ${t.targetToSource}` : t.sourceToTarget})),
    [reference.linkTypes]
  );

  return (
    <div className="settings-screen" ref={rootRef}>
      <div className="settings-header">
        <h2 className="settings-title">{screenTitle(isNew, duplicating, board.name)}</h2>
        {readOnly && <span className="settings-readonly">Read only: only the owner, a system administrator or an admin of all its projects can change this board.</span>}
      </div>

      <Section title="General">
        <div className="settings-field">
          <span className="settings-field__label">Name</span>
          <Input size={Size.L} value={draft.name} disabled={readOnly} placeholder="Board name" onChange={event => patch({name: event.target.value})}/>
        </div>
        <div className="settings-field">
          <span className="settings-field__label">Projects</span>
          <ProjectsSelect projects={projects} loading={projectsLoading} disabled={readOnly} value={draft.projects} onChange={list => patch({projects: list})}/>
          <span className="settings-field__help">Only issues from these projects are shown; fields are resolved against them.</span>
        </div>
        {!creating && <OwnerField owner={board.owner} canTransfer={canDelete} onTransfer={login => onTransfer(board.id, login)}/>}
        <ShareField
          shared={draft.shared}
          showToggle={showShareToggle}
          canShare={canShareDraft}
          readOnly={readOnly}
          onChange={shared => patch({shared})}
        />
        <RelatedBoardsField boardId={draft.id} value={draft.relatedBoards} boards={boards} disabled={readOnly} onChange={relatedBoards => patch({relatedBoards})}/>
      </Section>

      <Section title="Issues">
        <div className="settings-field">
          <span className="settings-field__label">Query</span>
          <QueryEditor value={draft.query} disabled={readOnly} searchAssist={youtrack.searchAssist} onChange={query => patch({query})} placeholder="e.g. #Unresolved"/>
        </div>
        <div className="settings-field">
          <Toggle checked={draft.sprints.enabled} disabled={readOnly} onChange={event => patch({sprints: {...draft.sprints, enabled: event.target.checked}})}>
            Use sprints
          </Toggle>
        </div>
        {draft.sprints.enabled && (
          <div className="settings-field">
            <span className="settings-field__label">Sprint field</span>
            <FieldSelect
              universe={reference.universe}
              kinds={SPRINT_FIELD_KINDS}
              value={draft.sprints.field}
              disabled={readOnly}
              onChange={field => patch({sprints: {...draft.sprints, field}})}
            />
            <span className="settings-field__help">The sprint selector lists the values of this field.</span>
          </div>
        )}
        <div className="settings-field">
          <span className="settings-field__label">Effective query</span>
          <code className="settings-code">{sampleQuery || '(all issues)'}</code>
        </div>
      </Section>

      <Section title="Columns">
        {reference.loading && <LoaderInline/>}
        <div className="settings-field">
          <span className="settings-field__label">Column field</span>
          <FieldSelect
            universe={reference.universe}
            kinds={COLUMN_FIELD_KINDS}
            singleOnly
            multiKinds={DYNAMIC_KINDS}
            excludeNames={sprintFieldNames}
            value={draft.columnField}
            disabled={readOnly}
            onChange={onColumnField}
          />
        </div>
        <ColumnValues draft={draft} kind={columnKind} universe={reference.universe} readOnly={readOnly} patch={patch}/>
      </Section>

      <Section title="Swimlanes (rows)">
        <SwimlanesSection
          universe={reference.universe}
          row={draft.row}
          innerRow={draft.innerRow}
          readOnly={readOnly}
          onChange={patch}
          sprintFieldName={sprintFieldNames[0]}
        />
      </Section>

      <Section title="Cards">
        <div className="settings-field">
          <span className="settings-field__label">Color cards by</span>
          <FieldSelect
            universe={reference.universe}
            kinds={CARD_COLOR_FIELD_KINDS}
            singleOnly
            allowNone
            noneLabel="No color"
            value={draft.cardColorField}
            disabled={readOnly}
            onChange={field => patch({cardColorField: field})}
          />
          <span className="settings-field__help">Cards take the color of the value of this field, like YouTrack agile boards.</span>
        </div>
        <span className="settings-field__help">Fields shown at the bottom of each card in the normal card size.</span>
        <ListEditor values={draft.cardFields} options={cardFieldOptions} disabled={readOnly} addLabel="Add field" emptyMessage="No fields on cards" onChange={cardFields => patch({cardFields})}/>
      </Section>

      <Section title="Connectors">
        <span className="settings-field__help">Relations drawn as connectors between issues on the board.</span>
        <ListEditor values={draft.linkTypes} options={linkTypeOptions} disabled={readOnly} addLabel="Add relation" emptyMessage="No relations" onChange={linkTypes => patch({linkTypes})}/>
      </Section>

      {errors.length > 0 && (
        <ul className="settings-errors">
          {errors.map(message => <li key={message}>{message}</li>)}
        </ul>
      )}
      <MergeDialog merge={merge} onApply={applyMerge} onCancel={() => setMerge(null)}/>
      <SettingsFooter
        creating={creating}
        duplicating={duplicating}
        readOnly={readOnly}
        canDelete={canDelete && !creating}
        saving={saving}
        onSave={save}
        onCancel={cancel}
        onDuplicate={duplicate}
        onDelete={remove}
      />
    </div>
  );
};
