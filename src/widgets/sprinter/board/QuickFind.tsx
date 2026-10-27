import React from 'react';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import checkmarkIcon from '@jetbrains/icons/checkmark';
import closeIcon from '@jetbrains/icons/close';
import searchIcon from '@jetbrains/icons/search';

type Props = {
  term: string;
  matchCount: number;
  onChange: (term: string) => void;
  /** Enter: returns true when matches were selected, which closes the box. */
  onSubmit: () => boolean;
  onClose: () => void;
};

/** Interactive find opened with "/": a small box centered over the board. */
export const QuickFind: React.FC<Props> = ({term, matchCount, onChange, onSubmit, onClose}) => {
  const submit = () => {
    if (onSubmit()) {
      onClose();
    }
  };
  // Buttons must not take focus from the input: its blur would close the box before the click lands.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div className="quick-find" role="search">
      <Icon glyph={searchIcon} className="quick-find__icon"/>
      <input
        autoFocus
        className="quick-find__input"
        value={term}
        placeholder="Type to find and then enter to select..."
        aria-label="Find issue by ID or summary"
        onChange={event => onChange(event.target.value)}
        onBlur={onClose}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      {term.trim() && <span className="quick-find__count">{`${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}</span>}
      <Button
        className="quick-find__button"
        icon={checkmarkIcon}
        title="Select the found issues (Enter)"
        disabled={!term.trim() || matchCount === 0}
        onMouseDown={keepFocus}
        onClick={submit}
      />
      <Button className="quick-find__button" icon={closeIcon} title="Close (Escape)" onMouseDown={keepFocus} onClick={onClose}/>
    </div>
  );
};
