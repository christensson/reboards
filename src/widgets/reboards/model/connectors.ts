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
const BEZIER_CONTROL_WEIGHT = 3;
const BEZIER_MID_DIVISOR = 8;
/** Horizontal overlap (as a fraction of the narrower card) above which two cards count as stacked in one column. */
const STACKED_OVERLAP_RATIO = 0.5;
/** Vertical overlap (as a fraction of the shorter card) above which two cards count as side by side. */
const SIDE_BY_SIDE_OVERLAP_RATIO = 0.5;
/** Cards side by side with less space than this between them connect with an arc over the gap. */
const ADJACENT_GAP = 80;
/** Cards diagonally apart by up to this many card heights connect from the upper card's bottom border. */
const NEAR_CARD_HEIGHTS = 2;
const LOOP_MIN_BULGE = 28;
const LOOP_BULGE_STEP = 12;
const LOOP_MAX_BULGE = 120;
const ARC_MIN_HANDLE = 24;
const ARC_LANE_STEP = 12;
const CORNER_HANDLE_DIVISOR = 3;
/** How far the line ends outside the card, so markers do not reach into its border. */
const MARKER_GAP = 2;
/** Share of the sideways distance an end leans toward the other end, and its cap relative to the handle (about 30°). */
const LEAN = 0.2;
const MAX_LEAN_RATIO = 0.6;
const LANES_PER_SIDE = 2;
/** Ports on a left or right side spread over its middle half. */
const SIDE_SPAN = 0.5;
/** Ports on a top or bottom side sit one third in from the border facing the other cards, spread over a third. */
const THIRDS = 3;
const EDGE_SPAN = 1 / THIRDS;
/** The fullest a side gets when many ports need room. */
const MAX_SPAN = 0.9;
/** Smallest distance between two ports on one side. */
const PORT_GAP = 10;

export type Side = 'left' | 'right' | 'top' | 'bottom';

const NORMALS: Record<Side, Point> = {left: {x: -1, y: 0}, right: {x: 1, y: 0}, top: {x: 0, y: -1}, bottom: {x: 0, y: 1}};

const center = (r: Rect): Point => ({x: r.x + r.width / 2, y: r.y + r.height / 2});

const horizontalOverlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));

const verticalOverlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const horizontalGap = (a: Rect, b: Rect): number => Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);

/** True when the two cards sit in the same column (stacked vertically). */
export const isStacked = (from: Rect, to: Rect): boolean =>
  horizontalOverlap(from, to) >= STACKED_OVERLAP_RATIO * Math.min(from.width, to.width);

/** True when the two cards sit next to each other in a row, close enough for an arc over the gap. */
export const isSideBySide = (from: Rect, to: Rect): boolean =>
  !isStacked(from, to) &&
  verticalOverlap(from, to) >= SIDE_BY_SIDE_OVERLAP_RATIO * Math.min(from.height, to.height) &&
  horizontalGap(from, to) < ADJACENT_GAP;

/** Space between two cards above each other; 0 when they overlap vertically. */
const verticalGap = (a: Rect, b: Rect): number => Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));

/**
 * True when the two cards are near each other diagonally: in neighbouring places, close
 * sideways, and at most NEAR_CARD_HEIGHTS card heights apart vertically. Their connector
 * then leaves the upper card through its bottom border instead of a side.
 */
export const isNearDiagonal = (from: Rect, to: Rect): boolean =>
  !isStacked(from, to) &&
  !isSideBySide(from, to) &&
  horizontalGap(from, to) < ADJACENT_GAP &&
  verticalGap(from, to) <= NEAR_CARD_HEIGHTS * Math.min(from.height, to.height);

/** The side of `card` facing `other` horizontally. */
const facingSide = (card: Rect, other: Rect): Side => (center(other).x >= center(card).x ? 'right' : 'left');

/** An edge to route: the two cards it connects and their places on screen. */
export type RouteItem = {id: string; fromId: string; toId: string; from: Rect; to: Rect};

type Plan = RouteItem & {
  kind: 'loop' | 'arc' | 'corner' | 'curve';
  fromSide: Side;
  toSide: Side;
  /** Loops and arcs between the same cards (or in the same column) grow apart by lane. */
  level: number;
};

/**
 * Picks the sides an edge leaves and enters through:
 * - cards stacked in one column: a loop out of the same side, alternating right and left;
 * - cards side by side: an arc over them between their top borders, the next one under them;
 * - cards near each other diagonally: from the upper card's bottom border to the lower card's facing side;
 * - otherwise an S-curve between the facing sides.
 */
const planEdge = (item: RouteItem, lanes: Map<string, number>): Plan => {
  const {from, to} = item;
  const take = (key: string): number => {
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    return lane;
  };
  if (isStacked(from, to)) {
    const lane = take(`stack:${Math.round(Math.min(from.x, to.x))}`);
    const side: Side = lane % LANES_PER_SIDE === 0 ? 'right' : 'left';
    return {...item, kind: 'loop', fromSide: side, toSide: side, level: Math.floor(lane / LANES_PER_SIDE)};
  }
  if (isSideBySide(from, to)) {
    const lane = take(`pair:${[item.fromId, item.toId].sort().join('>')}`);
    const side: Side = lane % LANES_PER_SIDE === 0 ? 'top' : 'bottom';
    return {...item, kind: 'arc', fromSide: side, toSide: side, level: Math.floor(lane / LANES_PER_SIDE)};
  }
  if (isNearDiagonal(from, to)) {
    const fromIsUpper = center(from).y <= center(to).y;
    return {
      ...item,
      kind: 'corner',
      fromSide: fromIsUpper ? 'bottom' : facingSide(from, to),
      toSide: fromIsUpper ? facingSide(to, from) : 'bottom',
      level: 0
    };
  }
  const rightward = center(to).x >= center(from).x;
  return {...item, kind: 'curve', fromSide: rightward ? 'right' : 'left', toSide: rightward ? 'left' : 'right', level: 0};
};

type Endpoint = {edgeId: string; end: 'from' | 'to'; rect: Rect; side: Side; other: Point};

const isVertical = (side: Side): boolean => side === 'left' || side === 'right';

/** Evenly spread positions for n ports around `anchor`, over `span`, at least PORT_GAP apart while the side allows. */
const spread = (n: number, anchor: number, span: number, length: number): number[] => {
  if (n === 1) {
    return [anchor];
  }
  const width = Math.min(Math.max(span, PORT_GAP * (n - 1)), length * MAX_SPAN);
  return Array.from({length: n}, (_v, i) => anchor - width / 2 + (width * i) / (n - 1));
};

/** Where ports on a top or bottom border gather: one third in from the border facing the other cards, else the middle. */
const edgeAnchor = (rect: Rect, endpoints: Endpoint[]): number => {
  const mid = rect.x + rect.width / 2;
  if (endpoints.every(e => e.other.x >= mid)) {
    return rect.x + rect.width - rect.width * EDGE_SPAN;
  }
  if (endpoints.every(e => e.other.x < mid)) {
    return rect.x + rect.width * EDGE_SPAN;
  }
  return mid;
};

/**
 * Ports of one card side, in the order of the other ends so lines fan out without crossing.
 * Left and right sides use their middle; top and bottom sides the third facing the other cards.
 */
const portsOf = (endpoints: Endpoint[]): Map<Endpoint, Point> => {
  const {rect, side} = endpoints[0];
  const vertical = isVertical(side);
  const sorted = [...endpoints].sort((a, b) => (vertical ? a.other.y - b.other.y : a.other.x - b.other.x));
  const ports = new Map<Endpoint, Point>();
  if (vertical) {
    const x = side === 'right' ? rect.x + rect.width : rect.x;
    const positions = spread(sorted.length, rect.y + rect.height / 2, rect.height * SIDE_SPAN, rect.height);
    sorted.forEach((endpoint, i) => ports.set(endpoint, {x, y: positions[i]}));
    return ports;
  }
  const y = side === 'bottom' ? rect.y + rect.height : rect.y;
  const positions = spread(sorted.length, edgeAnchor(rect, sorted), rect.width * EDGE_SPAN, rect.width);
  sorted.forEach((endpoint, i) => ports.set(endpoint, {x: positions[i], y}));
  return ports;
};

const handleOf = (plan: Plan, start: Point, end: Point): number => {
  if (plan.kind === 'loop') {
    return Math.min(LOOP_MAX_BULGE, LOOP_MIN_BULGE + plan.level * LOOP_BULGE_STEP);
  }
  if (plan.kind === 'corner') {
    // Long enough to turn the corner smoothly, from a border to a side.
    return Math.max(ARC_MIN_HANDLE, (Math.abs(end.x - start.x) + Math.abs(end.y - start.y)) / CORNER_HANDLE_DIVISOR);
  }
  if (plan.kind === 'arc') {
    return Math.max(ARC_MIN_HANDLE, Math.max(0, horizontalGap(plan.from, plan.to)) / 2 + plan.level * ARC_LANE_STEP);
  }
  return Math.max(MIN_HANDLE, Math.abs(end.x - start.x) * HANDLE_RATIO);
};

/** A cubic bezier that leaves `start` and enters `end` along their sides' outward normals. */
const curveBetween = (start: Point, fromSide: Side, port: Point, toSide: Side, handle: number): EdgeGeometry => {
  const n1 = NORMALS[fromSide];
  const n2 = NORMALS[toSide];
  // The marker ends a little outside the card, clear of its border and the selection ring.
  const end = {x: port.x + n2.x * MARKER_GAP, y: port.y + n2.y * MARKER_GAP};
  const c1 = {x: start.x + n1.x * handle, y: start.y + n1.y * handle};
  const c2 = {x: end.x + n2.x * handle, y: end.y + n2.y * handle};
  // Lean both ends a little toward the other end: a strongly bending line then meets the card at
  // a slant, so its arrowhead or diamond turns with the line instead of pointing dead straight.
  const lean = (control: Point, normal: Point, from: Point, to: Point): void => {
    const limit = handle * MAX_LEAN_RATIO;
    const clamp = (value: number) => Math.max(-limit, Math.min(limit, value * LEAN));
    if (normal.x !== 0) {
      control.y += clamp(to.y - from.y);
    } else {
      control.x += clamp(to.x - from.x);
    }
  };
  lean(c1, n1, start, end);
  lean(c2, n2, end, start);
  // B(0.5) = (P0 + 3 P1 + 3 P2 + P3) / 8
  const mid = {
    x: (start.x + BEZIER_CONTROL_WEIGHT * c1.x + BEZIER_CONTROL_WEIGHT * c2.x + end.x) / BEZIER_MID_DIVISOR,
    y: (start.y + BEZIER_CONTROL_WEIGHT * c1.y + BEZIER_CONTROL_WEIGHT * c2.y + end.y) / BEZIER_MID_DIVISOR
  };
  return {path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, mid, start, end};
};

/**
 * Routes all connectors at once: each edge gets its sides (loop, arc or S-curve), then every end
 * gets a port of its own on that side, so relations of one card do not start on top of each other.
 */
export const routeEdges = (items: RouteItem[]): Map<string, EdgeGeometry> => {
  const lanes = new Map<string, number>();
  const plans = items.map(item => planEdge(item, lanes));
  const bySide = new Map<string, Endpoint[]>();
  const endpointsOf = new Map<string, {from: Endpoint; to: Endpoint}>();
  const addToSide = (cardId: string, endpoint: Endpoint): void => {
    const key = `${cardId}:${endpoint.side}`;
    bySide.set(key, [...(bySide.get(key) ?? []), endpoint]);
  };
  plans.forEach(plan => {
    const from: Endpoint = {edgeId: plan.id, end: 'from', rect: plan.from, side: plan.fromSide, other: center(plan.to)};
    const to: Endpoint = {edgeId: plan.id, end: 'to', rect: plan.to, side: plan.toSide, other: center(plan.from)};
    endpointsOf.set(plan.id, {from, to});
    addToSide(plan.fromId, from);
    addToSide(plan.toId, to);
  });
  const ports = new Map<Endpoint, Point>();
  bySide.forEach(endpoints => portsOf(endpoints).forEach((point, endpoint) => ports.set(endpoint, point)));
  const geometries = new Map<string, EdgeGeometry>();
  plans.forEach(plan => {
    const ends = endpointsOf.get(plan.id);
    const start = ends && ports.get(ends.from);
    const end = ends && ports.get(ends.to);
    if (start && end) {
      geometries.set(plan.id, curveBetween(start, plan.fromSide, end, plan.toSide, handleOf(plan, start, end)));
    }
  });
  return geometries;
};
