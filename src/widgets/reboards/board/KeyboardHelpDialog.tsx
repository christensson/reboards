import React from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';

type Props = {
  show: boolean;
  /** The Gantt layout's keys instead of the board's. */
  gantt?: boolean;
  onClose: () => void;
};

/** One key, or a word such as "arrows" that stands for several. */
type Key = string | {word: string};

/** Keys pressed together, such as Shift and P. */
type Combo = Key[];

/** A shortcut: one or more alternative combinations, and what they do. */
type Shortcut = {keys: Combo[]; text: string};

const SHORTCUTS: Shortcut[] = [
  {keys: [['←'], ['→'], ['↑'], ['↓']], text: 'Select the card next to the selected one'},
  {keys: [['Enter']], text: 'Open the selected issue in a new tab'},
  {keys: [['Ctrl', {word: 'arrows'}]], text: 'Move the selected card to the next column or swimlane; Enter applies, Esc cancels'},
  {keys: [['P']], text: 'Select the parent of the selected issue'},
  {keys: [['Shift', 'P']], text: 'Go back to the subtask you came from, else to the first subtask'},
  {keys: [['S']], text: 'Go to the next swimlane and its first card'},
  {keys: [['Shift', 'S']], text: 'Go to the previous swimlane'},
  {keys: [['R']], text: 'Show or hide relation connectors'},
  {keys: [['/']], text: 'Find issues by ID or summary; Enter or ↓ goes to the next match, ↑ to the previous, Ctrl+Enter selects'},
  {keys: [['Esc']], text: 'Clear the selection'},
  {keys: [['?']], text: 'Show these shortcuts'}
];

const GANTT_SHORTCUTS: Shortcut[] = [
  {keys: [['↑'], ['↓']], text: 'Select the previous or next issue'},
  {keys: [['←']], text: 'Collapse the selected issue, else select its parent'},
  {keys: [['→']], text: 'Expand the selected issue, else select its first subtask'},
  {keys: [['Enter']], text: 'Open the selected issue in a new tab; on a "without time" row, show or hide those issues'},
  {keys: [['P']], text: 'Select the parent of the selected issue'},
  {keys: [['Shift', 'P']], text: 'Go back to the subtask you came from, else to the first subtask'},
  {keys: [['S']], text: 'Go to the next top-level issue'},
  {keys: [['Shift', 'S']], text: 'Go to the previous top-level issue'},
  {keys: [['R']], text: 'Show or hide relation arrows'},
  {keys: [['+'], ['−']], text: 'Zoom the time scale in or out; Ctrl+scroll or a pinch over the chart zooms too'},
  {keys: [['/']], text: 'Find issues by ID or summary; Enter or ↓ goes to the next match, ↑ to the previous, Ctrl+Enter selects'},
  {keys: [['Esc']], text: 'Clear the selection'},
  {keys: [['?']], text: 'Show these shortcuts'}
];

const keyLabel = (key: Key): string => (typeof key === 'string' ? key : key.word);

/** Keys pressed together, each drawn as a key, joined by "+". */
const ComboKeys: React.FC<{combo: Combo}> = ({combo}) => (
  <span className="shortcuts__combo">
    {combo.map((key, index) => (
      <React.Fragment key={keyLabel(key)}>
        {index > 0 && <span className="shortcuts__plus">+</span>}
        {typeof key === 'string' ? <kbd className="shortcuts__key">{key}</kbd> : <span className="shortcuts__word">{key.word}</span>}
      </React.Fragment>
    ))}
  </span>
);

/** The board's keyboard shortcuts (or the Gantt layout's), opened with "?" or from the Show menu. */
export const KeyboardHelpDialog: React.FC<Props> = ({show, gantt = false, onClose}) => (
  <Dialog show={show} onCloseAttempt={onClose} label="Keyboard shortcuts" trapFocus>
    <Header>Keyboard shortcuts</Header>
    <Content>
      <table className="shortcuts">
        <tbody>
          {(gantt ? GANTT_SHORTCUTS : SHORTCUTS).map(shortcut => (
            <tr key={shortcut.text}>
              <td className="shortcuts__keys">
                {shortcut.keys.map(combo => <ComboKeys key={combo.map(keyLabel).join('+')} combo={combo}/>)}
              </td>
              <td>{shortcut.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Content>
    <Panel>
      <Button onClick={onClose}>Close</Button>
    </Panel>
  </Dialog>
);
