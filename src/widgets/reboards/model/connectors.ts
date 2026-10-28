import type {BoardIssue} from './issue';

export type EdgeKind = 'directed' | 'aggregation' | 'undirected';

export type Edge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  typeName: string;
};

/**
 * Builds connector edges for issues that are visible on the board.
 * Directed links are drawn once, from the inward side to the outward side
 * (e.g. "A depends on B" → A → B, "child subtask of parent" → child → parent),
 * labelled with the inward relation name. Aggregation links get a diamond at
 * the parent end instead of an arrowhead. Undirected links are drawn once.
 */
export const computeEdges = (issues: BoardIssue[], visibleIds: Set<string>, linkTypes: string[]): Edge[] => {
  const allowed = new Set(linkTypes);
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const push = (edge: Edge): void => {
    if (!seen.has(edge.id)) {
      seen.add(edge.id);
      edges.push(edge);
    }
  };
  issues.forEach(issue => {
    if (!visibleIds.has(issue.id)) {
      return;
    }
    issue.links.forEach(link => {
      if (!allowed.has(link.typeName)) {
        return;
      }
      link.issueIds.forEach(otherId => {
        if (!visibleIds.has(otherId) || otherId === issue.id) {
          return;
        }
        if (link.direction === 'BOTH' || !link.directed) {
          const [a, b] = issue.id < otherId ? [issue.id, otherId] : [otherId, issue.id];
          push({id: `${link.typeId}:${a}:${b}`, from: a, to: b, label: link.sourceToTarget, kind: 'undirected', typeName: link.typeName});
          return;
        }
        if (link.direction === 'INWARD') {
          push({
            id: `${link.typeId}:${issue.id}:${otherId}`,
            from: issue.id,
            to: otherId,
            label: link.targetToSource,
            kind: link.aggregation ? 'aggregation' : 'directed',
            typeName: link.typeName
          });
        }
      });
    });
  });
  return edges;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type EdgeGeometry = {
  path: string;
  mid: Point;
  start: Point;
  end: Point;
};

const MIN_HANDLE = 40;
const HANDLE_RATIO = 0.5;
const SAME_RECT_OFFSET = 24;
const BEZIER_CONTROL_WEIGHT = 3;
const BEZIER_MID_DIVISOR = 8;
/** Horizontal overlap (as a fraction of the narrower card) above which two cards count as stacked in one column. */
const STACKED_OVERLAP_RATIO = 0.5;
const LOOP_MIN_BULGE = 28;
const LOOP_BULGE_STEP = 12;
const LOOP_MAX_BULGE = 120;
const LANE_Y_STEP = 6;
const LANES_PER_SIDE = 2;
/** Fraction of the vertical distance mixed into the end tangents so markers follow the curve. */
const TANGENT_TILT = 0.2;

const center = (r: Rect): Point => ({x: r.x + r.width / 2, y: r.y + r.height / 2});

const horizontalOverlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));

/** True when the two cards sit in the same column (stacked vertically). */
export const isStacked = (from: Rect, to: Rect): boolean =>
  horizontalOverlap(from, to) >= STACKED_OVERLAP_RATIO * Math.min(from.width, to.width);

/**
 * Cubic bezier between two card rectangles.
 * Cards in different columns connect with an S-curve between their facing edges.
 * Cards stacked in one column connect with a loop that leaves and enters through
 * the same side; `lane` picks the side and the loop size so parallel edges stay apart.
 */
export const edgeGeometry = (from: Rect, to: Rect, lane = 0): EdgeGeometry => {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let start: Point;
  let end: Point;
  let c1: Point;
  let c2: Point;
  if (isStacked(from, to)) {
    const side = lane % LANES_PER_SIDE === 0 ? 1 : -1;
    const bulge = Math.min(LOOP_MAX_BULGE, LOOP_MIN_BULGE + Math.floor(lane / LANES_PER_SIDE) * LOOP_BULGE_STEP);
    start = {x: side > 0 ? from.x + from.width : from.x, y: a.y};
    end = {x: side > 0 ? to.x + to.width : to.x, y: b.y};
    c1 = {x: start.x + side * bulge, y: start.y + dy * TANGENT_TILT};
    c2 = {x: end.x + side * bulge, y: end.y - dy * TANGENT_TILT};
  } else {
    const sign = dx >= 0 ? 1 : -1;
    // Alternate small vertical offsets so edges between the same two cards do not coincide.
    const yShift = Math.ceil(lane / 2) * LANE_Y_STEP * (lane % 2 === 0 ? 1 : -1);
    start = {x: sign > 0 ? from.x + from.width : from.x, y: a.y + yShift};
    end = {x: sign > 0 ? to.x : to.x + to.width, y: b.y + yShift};
    const handle = Math.max(MIN_HANDLE, Math.abs(end.x - start.x) * HANDLE_RATIO) * sign;
    c1 = {x: start.x + handle, y: start.y + dy * TANGENT_TILT};
    c2 = {x: end.x - handle, y: end.y - dy * TANGENT_TILT};
  }
  if (dx === 0 && dy === 0) {
    end = {x: start.x + SAME_RECT_OFFSET, y: start.y};
  }
  // B(0.5) = (P0 + 3 P1 + 3 P2 + P3) / 8
  const mid = {
    x: (start.x + BEZIER_CONTROL_WEIGHT * c1.x + BEZIER_CONTROL_WEIGHT * c2.x + end.x) / BEZIER_MID_DIVISOR,
    y: (start.y + BEZIER_CONTROL_WEIGHT * c1.y + BEZIER_CONTROL_WEIGHT * c2.y + end.y) / BEZIER_MID_DIVISOR
  };
  const path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  return {path, mid, start, end};
};
