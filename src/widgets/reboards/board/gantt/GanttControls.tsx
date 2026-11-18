import React from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Select, {type SelectItem} from '@jetbrains/ring-ui-built/components/select/select';
import addIcon from '@jetbrains/icons/add';
import collapseIcon from '@jetbrains/icons/double-chevron-right';
import expandIcon from '@jetbrains/icons/double-chevron-left';
import fullscreenIcon from '@jetbrains/icons/fullscreen';
import locateIcon from '@jetbrains/icons/locate';
import removeIcon from '@jetbrains/icons/remove';
import {GANTT_ZOOMS, type GanttZoom} from '@/common/storage/prefs';
import {tierFor} from '../../model/ganttScale';
import {KEY_ZOOM} from './useGanttZoom';

type Props = {
  pxPerDay: number;
  collapsed: boolean;
  onCollapsed: (collapsed: boolean) => void;
  onPreset: (zoom: GanttZoom) => void;
  onZoomBy: (factor: number) => void;
  onFit: () => void;
  /** Shows the selected issues, or today with nothing selected. */
  onLocate: () => void;
  hasSelection: boolean;
  style: React.CSSProperties;
};

const ZOOM_LABELS: Record<GanttZoom, string> = {day: 'Days', week: 'Weeks', month: 'Months', quarter: 'Quarters'};
const ZOOM_ITEMS: SelectItem[] = GANTT_ZOOMS.map(zoom => ({key: zoom, label: ZOOM_LABELS[zoom]}));
/** Above the panel (z-index 6) and the chart's sticky header. */
const POPUP_STYLE: React.CSSProperties = {zIndex: 20};

/**
 * The chart's own controls, floating over its top right corner like map controls: zoom out and
 * in, the time scale, Fit, and show the selected issue (or today). Collapsed, only zoom and Fit stay.
 */
export const GanttControls: React.FC<Props> = ({pxPerDay, collapsed, onCollapsed, onPreset, onZoomBy, onFit, onLocate, hasSelection, style}) => {
  const tier = tierFor(pxPerDay);
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keeps clicks from reaching the chart rows
    <div className={`gantt-controls${collapsed ? ' gantt-controls_collapsed' : ''}`} style={style} role="toolbar" aria-label="Chart controls" onClick={event => event.stopPropagation()}>
      <Button className="gantt-controls__button" icon={removeIcon} title="Zoom out (−, or Ctrl+scroll)" aria-label="Zoom out" onClick={() => onZoomBy(1 / KEY_ZOOM)}/>
      {!collapsed && (
        <Select
          className="gantt-controls__scale"
          type={Select.Type.INLINE}
          label="Time scale"
          // Over the floating panel it opens from.
          popupStyle={POPUP_STYLE}
          data={ZOOM_ITEMS}
          selected={ZOOM_ITEMS.find(item => item.key === tier) ?? null}
          onChange={(item: SelectItem | null) => item && onPreset(item.key as GanttZoom)}
        />
      )}
      <Button className="gantt-controls__button" icon={addIcon} title="Zoom in (+, or Ctrl+scroll)" aria-label="Zoom in" onClick={() => onZoomBy(KEY_ZOOM)}/>
      <span className="gantt-controls__divider" aria-hidden="true"/>
      <Button className="gantt-controls__button" icon={fullscreenIcon} title="Zoom to show every issue" aria-label="Fit" onClick={onFit}/>
      {!collapsed && (
        <Button
          className="gantt-controls__button"
          icon={locateIcon}
          title={hasSelection ? 'Show the selected issue' : 'Scroll to today (select an issue to show it)'}
          aria-label={hasSelection ? 'Show the selected issue' : 'Today'}
          onClick={onLocate}
        />
      )}
      <span className="gantt-controls__divider" aria-hidden="true"/>
      <Button
        className="gantt-controls__button"
        icon={collapsed ? expandIcon : collapseIcon}
        title={collapsed ? 'Show the time scale and Today' : 'Hide the time scale and Today'}
        aria-label={collapsed ? 'Show more chart controls' : 'Show fewer chart controls'}
        aria-expanded={!collapsed}
        onClick={() => onCollapsed(!collapsed)}
      />
    </div>
  );
};
