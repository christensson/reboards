import React, {useLayoutEffect, useRef} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import closeIcon from '@jetbrains/icons/close';

type Props = {
  /** The mode and its keys, on the first row. */
  title: string;
  /** Where navigation is, on the second row; null hides the banner. */
  status: string | null;
  /** Name of the mode for the close button's tooltip. */
  modeName: string;
  onClose: () => void;
};

/** The room the banner takes at the bottom of the screen, kept clear when a card is scrolled into view. */
const SPACE_VARIABLE = '--nav-mode-banner-space';

/** Shown at the bottom of the screen while a keyboard navigation mode is on. */
export const NavModeBanner: React.FC<Props> = ({title, status, modeName, onClose}) => {
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
    <div ref={ref} className="nav-mode-banner" role="status">
      <div className="nav-mode-banner__text">
        <div>{title}</div>
        <div className="nav-mode-banner__status">{status}</div>
      </div>
      <Button className="nav-mode-banner__close" icon={closeIcon} title={`Exit ${modeName}`} onClick={onClose}/>
    </div>
  );
};
