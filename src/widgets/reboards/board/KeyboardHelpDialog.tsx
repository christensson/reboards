import React from 'react';
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {Header, Content} from '@jetbrains/ring-ui-built/components/island/island';
import Panel from '@jetbrains/ring-ui-built/components/panel/panel';

type Props = {
  show: boolean;
  onClose: () => void;
};

const SHORTCUTS: {keys: string[]; text: string}[] = [
  {keys: ['←', '→', '↑', '↓'], text: 'Select the card next to the selected one'},
  {keys: ['Enter'], text: 'Open the selected issue in a new tab'},
  {keys: ['Ctrl', '+ arrows'], text: 'Move the selected card to the next column or swimlane; Enter applies, Esc cancels'},
  {keys: ['P'], text: 'Select the parent of the selected issue'},
  {keys: ['Shift', '+ P'], text: 'Go back to the subtask you came from'},
  {keys: ['R'], text: 'Show or hide relation connectors'},
  {keys: ['/'], text: 'Find issues by ID or summary; Enter goes to the next match, Ctrl+Enter selects'},
  {keys: ['Esc'], text: 'Clear the selection'},
  {keys: ['?'], text: 'Show these shortcuts'}
];

/** The board's keyboard shortcuts, opened with "?" or from the Show menu. */
export const KeyboardHelpDialog: React.FC<Props> = ({show, onClose}) => (
  <Dialog show={show} onCloseAttempt={onClose} label="Keyboard shortcuts" trapFocus>
    <Header>Keyboard shortcuts</Header>
    <Content>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(shortcut => (
            <tr key={shortcut.text}>
              <td className="shortcuts__keys">
                {shortcut.keys.map(key => (key.startsWith('+') ? <span key={key}>{` ${key} `}</span> : <kbd key={key} className="shortcuts__key">{key}</kbd>))}
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
