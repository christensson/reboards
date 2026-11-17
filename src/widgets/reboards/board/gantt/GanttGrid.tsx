import React, {memo} from 'react';
import {type GanttScale, dayX} from '../../model/ganttScale';
import {MS_PER_DAY, isWorkday} from '../../model/workTime';

const inScale = (scale: GanttScale, day: number): boolean => day >= scale.start && day < scale.end;

/** The two tiers of the time scale, with today marked. */
const GanttScaleHeaderComponent: React.FC<{scale: GanttScale; today: number}> = ({scale, today}) => (
  <div className="gantt-scale" style={{width: scale.width}}>
    {inScale(scale, today) && <span className="gantt-scale__today" style={{left: dayX(scale, today)}}>Today</span>}
    <div className="gantt-scale__tier gantt-scale__tier_top">
      {scale.top.map(tick => (
        <span key={tick.start} className="gantt-scale__tick" style={{left: dayX(scale, tick.start), width: dayX(scale, tick.end) - dayX(scale, tick.start)}}>
          <span className="gantt-scale__label">{tick.label}</span>
        </span>
      ))}
    </div>
    <div className="gantt-scale__tier">
      {scale.bottom.map(tick => (
        <span
          key={tick.start}
          className={`gantt-scale__tick${scale.showWeekends && !isWorkday(tick.start) ? ' gantt-scale__tick_weekend' : ''}`}
          style={{left: dayX(scale, tick.start), width: dayX(scale, tick.end) - dayX(scale, tick.start)}}
        >
          <span className="gantt-scale__label">{tick.label}</span>
        </span>
      ))}
    </div>
  </div>
);

export const GanttScaleHeader = memo(GanttScaleHeaderComponent);

/** Weekends as stretches of whole days: [start, end). */
const weekends = (scale: GanttScale): {start: number; end: number}[] => {
  const result: {start: number; end: number}[] = [];
  for (let day = scale.start; day < scale.end; day += MS_PER_DAY) {
    if (!isWorkday(day)) {
      const last = result[result.length - 1];
      if (last && last.end === day) {
        last.end = day + MS_PER_DAY;
      } else {
        result.push({start: day, end: day + MS_PER_DAY});
      }
    }
  }
  return result;
};

type GridProps = {scale: GanttScale; height: number; today: number};

/** Behind the bars: shaded weekends, the scale's lines, and today. */
const GanttGridComponent: React.FC<GridProps> = ({scale, height, today}) => (
  <div className="gantt-grid" style={{width: scale.width, height}} aria-hidden="true">
    {scale.showWeekends && weekends(scale).map(weekend => (
      <span key={weekend.start} className="gantt-grid__weekend" style={{left: dayX(scale, weekend.start), width: dayX(scale, weekend.end) - dayX(scale, weekend.start)}}/>
    ))}
    {scale.bottom.map(tick => <span key={`b${tick.start}`} className="gantt-grid__line" style={{left: dayX(scale, tick.start)}}/>)}
    {scale.top.map(tick => <span key={`t${tick.start}`} className="gantt-grid__line gantt-grid__line_major" style={{left: dayX(scale, tick.start)}}/>)}
    {inScale(scale, today) && <span className="gantt-grid__today" style={{left: dayX(scale, today)}}/>}
  </div>
);

export const GanttGrid = memo(GanttGridComponent);
