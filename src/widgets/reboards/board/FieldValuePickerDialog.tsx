import React, {useEffect, useMemo, useRef, useState} from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import {Input, Size} from '@jetbrains/ring-ui-built/components/input/input';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import {ValuePill} from '@/common/components/ValuePill';
import {type DynamicOptions, type FieldRef, isDynamicField} from '@/common/model/board-config';
import {choosableValues, noValueLabel} from '../model/dynamicValues';
import type {FieldUniverse, UniverseValue} from '../model/fieldUniverse';
import type {BoardIssue} from '../model/issue';
import {orderValues} from '../model/sorting';

type Props = {
  show: boolean;
  field: FieldRef | null;
  universe: FieldUniverse;
  /** Issues on the board, used to offer observed values of user and integer fields. */
  issues: BoardIssue[];
  /** Filter and sort of a dynamic field's values (user, version, build). */
  options?: DynamicOptions;
  subjectLabel: string;
  /** The values the moved issues have now: checked to start with for a multi-value field. */
  currentKeys?: string[];
  /** A single-value field gives the picked key (null clears it); a multi-value one all checked keys. */
  onPick: (picked: string | null | string[]) => void;
  onCancel: () => void;
};

type Choice = Pick<UniverseValue, 'key' | 'label' | 'color' | 'avatarUrl'>;

const stableChoices = (field: FieldRef, universe: FieldUniverse, issues: BoardIssue[]): Choice[] => {
  const known = new Map((universe.byName.get(field.name)?.values ?? []).map(v => [v.key, v]));
  issues.forEach(issue => {
    const value = issue.fields[field.name];
    value?.keys.forEach((key, index) => {
      if (!known.has(key)) {
        known.set(key, {key, label: value.labels[index] ?? key, ordinal: known.size, color: value.color, avatarUrl: value.avatarUrl});
      }
    });
  });
  return orderValues(Array.from(known.values()), 'custom', []);
};

/** Longer than dnd-kit keeps its selection listener after a drop (50 ms). */
const FOCUS_DELAY_MS = 120;

const matches = (term: string, ...texts: string[]): boolean => texts.some(text => text.toLowerCase().includes(term));

type ItemProps = {
  choice: Choice;
  onPick: () => void;
  empty: boolean;
  match: boolean;
  dimmed: boolean;
  selected: boolean;
  /** Multi-value fields: whether the value is checked; undefined for single-value fields. */
  checked?: boolean;
  itemRef: (element: HTMLButtonElement | null) => void;
};

const ChoiceItem: React.FC<ItemProps> = ({choice, onPick, empty, match, dimmed, selected, checked, itemRef}) => {
  const classes = [
    'value-picker__item',
    empty ? 'value-picker__item_empty' : '',
    match ? 'value-picker__item_match' : '',
    dimmed ? 'value-picker__item_dimmed' : '',
    selected ? 'value-picker__item_selected' : ''
  ].filter(Boolean).join(' ');
  return (
    <li>
      <button
        ref={itemRef}
        type="button"
        tabIndex={-1}
        className={classes}
        // Keep focus in the search so Enter and Ctrl+Enter keep working after a click.
        onMouseDown={event => event.preventDefault()}
        onClick={onPick}
        aria-current={selected}
        aria-pressed={checked}
      >
        {/* Display only: the whole row toggles, so the box itself takes no clicks. */}
        {checked !== undefined && <Checkbox className="value-picker__checkbox" checked={checked} readOnly tabIndex={-1} aria-hidden/>}
        {choice.avatarUrl && <img className="value-picker__avatar" src={choice.avatarUrl} alt=""/>}
        {choice.color ? <ValuePill label={choice.label} color={choice.color}/> : <span className="value-picker__label">{choice.label}</span>}
      </button>
    </li>
  );
};

/** Index of the next item in `order` after `current`, wrapping around; `step` is 1 or -1. */
const stepIn = (order: number[], current: number | null, step: number): number | null => {
  if (order.length === 0) {
    return null;
  }
  const at = current === null ? -1 : order.indexOf(current);
  if (at < 0) {
    return step > 0 ? order[0] : order[order.length - 1];
  }
  return order[(at + step + order.length) % order.length];
};

const sameKeys = (a: string[], b: string[]): boolean => a.length === b.length && a.every(key => b.includes(key));

const useChoices = (field: FieldRef | null, universe: FieldUniverse, issues: BoardIssue[], options: DynamicOptions | undefined): Choice[] =>
  useMemo<Choice[]>(() => {
    if (!field) {
      return [];
    }
    const resolved = universe.byName.get(field.name);
    return options && isDynamicField(resolved?.kind ?? field.kind, options)
      ? choosableValues(field.name, resolved, issues, options)
      : stableChoices(field, universe, issues);
  }, [field, universe, issues, options]);

/** Focuses the search once the dialog is open and the drop is over. */
const useSearchFocus = (show: boolean, inputRef: React.RefObject<HTMLInputElement | null>): void => {
  useEffect(() => {
    if (!show) {
      return undefined;
    }
    // For 50 ms after a drop dnd-kit clears the selection on every change. In Chrome that takes
    // the caret out of the input the focus trap just focused, and typed keys are lost until a
    // caret is back. Once dnd-kit is done, focus the search and put the caret in explicitly.
    const timer = setTimeout(() => {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [show, inputRef]);
};

/**
 * Asks which value to set after a drop on an "Assign <field>…" column or row. Typing
 * highlights the values that contain the text and selects the first; arrow keys move the
 * selection (between matches while searching). For a single-value field a click or Enter sets
 * the selected value, and so does Ctrl+Enter. A multi-value field gets checkboxes instead: a
 * click or Enter toggles a value, and Ctrl+Enter or "Set" applies the checked values once
 * something changed.
 */
export const FieldValuePickerDialog: React.FC<Props> = ({show, field, universe, issues, options, subjectLabel, currentKeys = [], onPick, onCancel}) => {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const multi = Boolean(field && universe.byName.get(field.name)?.multi);
  const values = useChoices(field, universe, issues, options);
  // Single-value fields end with an item that clears the field, such as "No Assignee";
  // multi-value ones are cleared by unchecking everything.
  const items = useMemo<Choice[]>(
    () => (multi ? values : [...values, {key: '', label: noValueLabel(field?.name ?? 'value')}]),
    [values, field, multi]
  );
  const emptyIndex = multi ? -1 : items.length - 1;
  const term = filter.trim().toLowerCase();
  const matchIndexes = useMemo(
    () => (term ? items.map((item, index) => (matches(term, item.label, item.key) ? index : -1)).filter(index => index >= 0) : []),
    [items, term]
  );
  const currentKey = currentKeys.join('\u0000');
  useEffect(() => {
    if (show) {
      setChecked(currentKey ? currentKey.split('\u0000') : []);
    }
  }, [show, currentKey]);
  const changed = multi && !sameKeys(checked, currentKeys);

  useSearchFocus(show, inputRef);
  useEffect(() => {
    if (selected !== null) {
      itemRefs.current[selected]?.scrollIntoView({block: 'nearest'});
    }
  }, [selected]);

  const reset = () => {
    setFilter('');
    setSelected(null);
  };
  const toggle = (index: number) => {
    const key = items[index].key;
    setSelected(index);
    setChecked(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };
  const commit = () => {
    if (changed) {
      reset();
      // The field's value order, not the order the boxes were checked in; values not in the list
      // (such as hidden archived versions) stay as they are.
      const listed = values.map(v => v.key);
      onPick([...listed.filter(key => checked.includes(key)), ...checked.filter(key => !listed.includes(key))]);
    }
  };
  const pick = (index: number) => {
    if (multi) {
      toggle(index);
      return;
    }
    reset();
    onPick(index === emptyIndex ? null : items[index].key);
  };
  const cancel = () => {
    reset();
    onCancel();
  };
  const onSearch = (text: string) => {
    setFilter(text);
    const next = text.trim().toLowerCase();
    const first = next ? items.findIndex(item => matches(next, item.label, item.key)) : -1;
    setSelected(first >= 0 ? first : null);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const order = term ? matchIndexes : items.map((_item, index) => index);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(stepIn(order, selected, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Ctrl+Enter (Cmd+Enter) sets; a plain Enter toggles a value of a multi-value field.
      if (multi && (event.ctrlKey || event.metaKey)) {
        commit();
      } else if (selected !== null) {
        pick(selected);
      }
    }
  };

  return (
    <Dialog show={show} onCloseAttempt={cancel} label="Choose a value" trapFocus>
      <Header>{`Set ${field?.name ?? 'value'} for ${subjectLabel}`}</Header>
      <Content>
        <Input
          className="value-picker__filter"
          size={Size.FULL}
          placeholder="Search values"
          value={filter}
          inputRef={inputRef}
          onChange={event => onSearch(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <p className="value-picker__hint">
          {multi
            ? 'Enter or a click checks or unchecks a value; Ctrl+Enter sets the checked values.'
            : 'Enter, Ctrl+Enter or a click sets the selected value.'}
        </p>
        {term && matchIndexes.length === 0 && <p className="value-picker__none">No matching values</p>}
        <ul className="value-picker__list" role="listbox">
          {items.map((item, index) => (
            <ChoiceItem
              key={item.key || '\u0000empty'}
              choice={item}
              empty={index === emptyIndex}
              match={Boolean(term) && matchIndexes.includes(index)}
              dimmed={Boolean(term) && !matchIndexes.includes(index)}
              selected={index === selected}
              {...(multi ? {checked: checked.includes(item.key)} : {})}
              itemRef={element => {
                itemRefs.current[index] = element;
              }}
              onPick={() => pick(index)}
            />
          ))}
        </ul>
      </Content>
      <Panel>
        {multi && <Button primary disabled={!changed} onClick={commit}>Set</Button>}
        <Button onClick={cancel}>Cancel</Button>
      </Panel>
    </Dialog>
  );
};
