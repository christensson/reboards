import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import ButtonGroup from '@jetbrains/ring-ui-built/components/button-group/button-group';
import type {EditLine} from '../../model/ganttEdit';
import type {DragPoint} from './useBarDrag';

type Props = {
  title: string;
  lines: EditLine[];
  /** Where the bar was dropped, in viewport pixels. */
  at: DragPoint;
  onApply: () => void;
  onCancel: () => void;
  /** New plans: the levels the plan can set, the one picked, and picking another. */
  choices?: {key: string; label: string}[];
  choice?: string;
  onChoose?: (key: string) => void;
};

const OFFSET = 12;
const EDGE = 8;

/**
 * Confirms a change made by dragging, next to where the bar was dropped: what changes, from and
 * to. Enter applies, Escape or a click elsewhere cancels.
 */
export const GanttConfirm: React.FC<Props> = ({title, lines, at, onApply, onCancel, choices, choice, onChoose}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<React.CSSProperties>({left: at.x + OFFSET, top: at.y + OFFSET, visibility: 'hidden'});

  // Below and right of the drop point, flipped or shifted to stay in the window.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const {width, height} = element.getBoundingClientRect();
    const left = at.x + OFFSET + width > window.innerWidth - EDGE ? Math.max(EDGE, at.x - OFFSET - width) : at.x + OFFSET;
    const top = at.y + OFFSET + height > window.innerHeight - EDGE ? Math.max(EDGE, at.y - OFFSET - height) : at.y + OFFSET;
    setPosition({left, top});
  }, [at]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        (event.key === 'Enter' ? onApply : onCancel)();
      }
    };
    const onPress = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPress, true);
    };
  }, [onApply, onCancel]);

  return (
    <div ref={ref} className="gantt-confirm" style={position} role="dialog" aria-label={title}>
      <div className="gantt-confirm__title">{title}</div>
      {choices && onChoose && (
        <div className="gantt-confirm__choices">
          <span className="gantt-confirm__choices-label">Set</span>
          <ButtonGroup>
            {choices.map(item => (
              <Button key={item.key} active={item.key === choice} onClick={() => onChoose(item.key)}>{item.label}</Button>
            ))}
          </ButtonGroup>
        </div>
      )}
      {lines.length === 0 && <div className="gantt-confirm__empty">Nothing changes at this level.</div>}
      <dl className="gantt-confirm__lines">
        {lines.map(line => (
          <div key={line.label} className="gantt-confirm__line">
            <dt>{line.label}</dt>
            <dd>
              <span className="gantt-confirm__from">{line.from}</span>
              {' → '}
              <strong>{line.to}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <div className="gantt-confirm__actions">
        <Button primary disabled={lines.length === 0} onClick={onApply}>Apply</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};
