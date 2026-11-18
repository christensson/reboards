import React, {memo} from 'react';
import type {CardSize} from '@/common/storage/prefs';
import type {Edge} from '../../model/connectors';
import type {GanttIssueRow, GanttRow} from '../../model/gantt';
import type {GanttScale} from '../../model/ganttScale';
import {ROW_HEIGHT, anchorBox, markBottom, relationCurve} from './geometry';

type Props = {
  rows: GanttRow[];
  scale: GanttScale;
  size: CardSize;
  edges: Edge[];
  selectedIds: Set<string>;
};

/** How far inside a bar its tree line runs: the same for parent and subtask, so equal starts line up. */
const TREE_INSET = 6;
const TREE_DOT_RADIUS = 2.5;
const LABEL_FONT_SIZE = 11;
const LABEL_PADDING = 3;
const LABEL_CHAR_WIDTH = 6;
const LABEL_HEIGHT = 16;

type Placed = {row: GanttIssueRow; index: number};

const centerY = (index: number, size: CardSize): number => index * ROW_HEIGHT[size] + ROW_HEIGHT[size] / 2;

/** The x a tree line meets a bar at: a little inside its start, or its middle when it is narrower. */
const treeX = (box: {left: number; width: number}): number => box.left + Math.min(TREE_INSET, box.width / 2);

type TreeLine = {key: string; d: string; dot: {x: number; y: number}};

/**
 * Parent to subtask: down from just inside the parent's bar start, then across to a dot just
 * inside the subtask's bar start. A subtask starting with its parent gets just the dot.
 */
const treeLine = (parent: Placed, child: Placed, scale: GanttScale, size: CardSize): TreeLine | null => {
  const from = anchorBox(scale, parent.row);
  const to = anchorBox(scale, child.row);
  if (!from || !to) {
    return null;
  }
  const x = treeX(from);
  const dot = {x: treeX(to), y: centerY(child.index, size)};
  const top = parent.index * ROW_HEIGHT[size] + markBottom(parent.row, size);
  return {key: child.row.issue.id, d: `M ${x} ${top} V ${dot.y} H ${dot.x}`, dot};
};

type DrawnRelation = Edge & {path: string; mid: {x: number; y: number}; selected: boolean; title: string};

/** "B is required for A": from the end of B into the start of A. */
const drawRelation = (edge: Edge, placed: Map<string, Placed>, scale: GanttScale, size: CardSize, selectedIds: Set<string>): DrawnRelation | null => {
  const a = placed.get(edge.from);
  const b = placed.get(edge.to);
  const from = a && anchorBox(scale, a.row);
  const to = b && anchorBox(scale, b.row);
  if (!a || !b || !from || !to) {
    return null;
  }
  const curve = relationCurve({x: from.left + from.width, y: centerY(a.index, size)}, {x: to.left, y: centerY(b.index, size)});
  return {
    ...edge,
    ...curve,
    selected: selectedIds.has(edge.from) || selectedIds.has(edge.to),
    title: `${a.row.issue.idReadable} ${edge.label} ${b.row.issue.idReadable}`
  };
};

const Relation: React.FC<{edge: DrawnRelation}> = ({edge}) => {
  const labelWidth = edge.label.length * LABEL_CHAR_WIDTH + LABEL_PADDING * 2;
  const marker = edge.kind === 'undirected' ? undefined : `url(#gantt-arrow${edge.selected ? '-selected' : ''})`;
  return (
    <g className={`connectors__edge connectors__edge_${edge.kind}${edge.selected ? ' connectors__edge_selected' : ''}`}>
      <title>{edge.title}</title>
      <path d={edge.path} className="connectors__line" markerEnd={marker}/>
      {edge.label && (
        <g transform={`translate(${edge.mid.x - labelWidth / 2}, ${edge.mid.y - LABEL_HEIGHT / 2})`}>
          <rect width={labelWidth} height={LABEL_HEIGHT} rx="3" className="connectors__label-bg"/>
          <text x={labelWidth / 2} y={LABEL_HEIGHT / 2} className="connectors__label" fontSize={LABEL_FONT_SIZE} textAnchor="middle" dominantBaseline="central">
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
};

/**
 * Lines over the chart: the subtask tree, and the configured relations between issues on the
 * chart as labelled curves.
 */
const GanttArrowsComponent: React.FC<Props> = ({rows, scale, size, edges, selectedIds}) => {
  const placed = new Map<string, Placed>();
  rows.forEach((row, index) => {
    if (row.type === 'issue' && row.timed) {
      placed.set(row.issue.id, {row, index});
    }
  });
  const tree = Array.from(placed.values()).flatMap(child => {
    const parent = child.row.parentId ? placed.get(child.row.parentId) : undefined;
    const line = parent ? treeLine(parent, child, scale, size) : null;
    return line ? [line] : [];
  });
  // Selected relations last, so they are drawn over the others.
  const relations = edges
    .map(edge => drawRelation(edge, placed, scale, size, selectedIds))
    .filter((edge): edge is DrawnRelation => edge !== null)
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  return (
    <svg className="gantt-arrows" width={scale.width} height={rows.length * ROW_HEIGHT[size]} aria-hidden="true">
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="connectors__marker"/>
        </marker>
        <marker id="gantt-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="connectors__marker connectors__marker_selected"/>
        </marker>
      </defs>
      {tree.map(line => <path key={line.key} d={line.d} className="gantt-tree-line"/>)}
      {tree.map(line => <circle key={line.key} cx={line.dot.x} cy={line.dot.y} r={TREE_DOT_RADIUS} className="gantt-tree-dot"/>)}
      {relations.map(edge => <Relation key={edge.id} edge={edge}/>)}
    </svg>
  );
};

export const GanttArrows = memo(GanttArrowsComponent);
