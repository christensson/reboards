import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import checkmarkIcon from '@jetbrains/icons/checkmark';
import chevronDownIcon from '@jetbrains/icons/chevron-down';
import chevronUpIcon from '@jetbrains/icons/chevron-up';
import closeIcon from '@jetbrains/icons/close';
import searchIcon from '@jetbrains/icons/search';

type Props = {
  term: string;
  matchCount: number;
  /** 1-based position of the match the user cycled to; null before cycling. */
  position: number | null;
  onChange: (term: string) => void;
  /** Enter / Shift+Enter: go to the next or previous match. */
  onStep: (direction: 1 | -1) => void;
  /** Ctrl+Enter: select the current match (all matches before cycling); returns true when anything was selected. */
  onSubmit: () => boolean;
  onClose: () => void;
};

const countText = (matchCount: number, position: number | null): string => {
  if (position !== null) {
    return `${position} of ${matchCount}`;
  }
  return `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`;
};

/**
 * Interactive find opened with "/": a small box a third down the board, clear of the centered match. Enter goes through the
 * matches one by one, selecting and scrolling to each; Ctrl+Enter selects and closes.
 */
export const QuickFind: React.FC<Props> = ({term, matchCount, position, onChange, onStep, onSubmit, onClose}) => {
  const submit = () => {
    if (onSubmit()) {
      onClose();
    }
  };
  // Buttons must not take focus from the input: its blur would close the box before the click lands.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const none = !term.trim() || matchCount === 0;
  return (
    <div className="quick-find" role="search">
      <Icon glyph={searchIcon} className="quick-find__icon"/>
      <input
        autoFocus
        className="quick-find__input"
        value={term}
        placeholder="Type to find, Enter for the next, Ctrl+Enter to select…"
        aria-label="Find issue by ID or summary"
        onChange={event => onChange(event.target.value)}
        onBlur={onClose}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
              submit();
            } else if (!none) {
              onStep(event.shiftKey ? -1 : 1);
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      {term.trim() && <span className="quick-find__count">{countText(matchCount, position)}</span>}
      <Button className="quick-find__button" icon={chevronUpIcon} title="Previous match (Shift+Enter)" disabled={none} onMouseDown={keepFocus} onClick={() => onStep(-1)}/>
      <Button className="quick-find__button" icon={chevronDownIcon} title="Next match (Enter)" disabled={none} onMouseDown={keepFocus} onClick={() => onStep(1)}/>
      <Button
        className="quick-find__button"
        icon={checkmarkIcon}
        title={position === null ? 'Select the found issues (Ctrl+Enter)' : 'Select this issue (Ctrl+Enter)'}
        disabled={none}
        onMouseDown={keepFocus}
        onClick={submit}
      />
      <Button className="quick-find__button" icon={closeIcon} title="Close (Escape)" onMouseDown={keepFocus} onClick={onClose}/>
    </div>
  );
};
