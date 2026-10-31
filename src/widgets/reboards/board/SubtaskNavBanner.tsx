import React, {useLayoutEffect, useRef} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import closeIcon from '@jetbrains/icons/close';

type Props = {
  /** Where navigation is, shown on the second row; null hides the banner. */
  status: string | null;
  onClose: () => void;
};

/** The room the banner takes at the bottom of the screen, kept clear when a card is scrolled into view. */
const SPACE_VARIABLE = '--subtask-nav-banner-space';

/** Shown at the bottom of the screen while the arrow keys move within the subtask hierarchy. */
export const SubtaskNavBanner: React.FC<Props> = ({status, onClose}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Cards scrolled into view stop above the banner (their scroll-margin-bottom uses this space).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const {top} = element.getBoundingClientRect();
    document.documentElement.style.setProperty(SPACE_VARIABLE, `${Math.max(0, window.innerHeight - top)}px`);
    return () => {
      document.documentElement.style.removeProperty(SPACE_VARIABLE);
    };
  });
  if (status === null) {
    return null;
  }
  return (
    <div ref={ref} className="subtask-nav-banner" role="status">
      <div className="subtask-nav-banner__text">
        <div>Subtask navigation mode. Use arrow keys to move within the subtask hierarchy. Esc exits mode.</div>
        <div className="subtask-nav-banner__status">{status}</div>
      </div>
      <Button className="subtask-nav-banner__close" icon={closeIcon} title="Exit subtask navigation mode" onClick={onClose}/>
    </div>
  );
};
