import React from 'react';
import type {YtColor} from '@/common/youtrack/types';
import './value-pill.css';

type Props = {
  label: string;
  color?: YtColor | null;
  className?: string;
  title?: string;
};

/** Small chip that shows a field value with its YouTrack color. */
export const ValuePill: React.FC<Props> = ({label, color, className, title}) => {
  const style = color ? {backgroundColor: color.background, color: color.foreground} : undefined;
  return (
    <span className={`value-pill${className ? ` ${className}` : ''}`} style={style} title={title ?? label}>
      {label}
    </span>
  );
};
