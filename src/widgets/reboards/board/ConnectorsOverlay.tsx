import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import type {ConnectorsMode} from '@/common/storage/prefs';
import {type Edge, type Rect, type RouteItem, routeEdges} from '../model/connectors';
import type {CardRegistry} from './BoardContext';

type Props = {
  edges: Edge[];
  selectedIds: Set<string>;
  mode: ConnectorsMode;
  contentRef: React.RefObject<HTMLDivElement | null>;
  registry: CardRegistry;
  /** Any value whose change should trigger a re-measure. */
  layoutVersion: unknown;
};

type DrawnEdge = Edge & {path: string; mid: {x: number; y: number}; selected: boolean};

const rectOf = (element: HTMLElement, base: DOMRect): Rect => {
  const r = element.getBoundingClientRect();
  return {x: r.left - base.left, y: r.top - base.top, width: r.width, height: r.height};
};

const LABEL_FONT_SIZE = 11;
const LABEL_PADDING = 3;
const LABEL_CHAR_WIDTH = 6;
const LABEL_HEIGHT = 16;

const markerFor = (kind: Edge['kind'], selected: boolean): string | undefined => {
  const suffix = selected ? '-selected' : '';
  if (kind === 'directed') {
    return `url(#connector-arrow${suffix})`;
  }
  if (kind === 'aggregation') {
    return `url(#connector-diamond${suffix})`;
  }
  return undefined;
};

export const ConnectorsOverlay: React.FC<Props> = ({edges, selectedIds, mode, contentRef, registry, layoutVersion}) => {
  const [drawn, setDrawn] = useState<DrawnEdge[]>([]);
  const [size, setSize] = useState({width: 0, height: 0});

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    const base = content.getBoundingClientRect();
    const visible = mode === 'none' ? [] : edges.filter(edge => mode === 'all' || selectedIds.has(edge.from) || selectedIds.has(edge.to));
    // Every edge is routed together with the others so each end gets a port of its own.
    const items: RouteItem[] = visible.flatMap(edge => {
      const from = registry.get(edge.from);
      const to = registry.get(edge.to);
      return from && to ? [{id: edge.id, fromId: edge.from, toId: edge.to, from: rectOf(from, base), to: rectOf(to, base)}] : [];
    });
    const routed = routeEdges(items);
    const next: DrawnEdge[] = visible.flatMap(edge => {
      const geometry = routed.get(edge.id);
      return geometry ? [{...edge, path: geometry.path, mid: geometry.mid, selected: selectedIds.has(edge.from) || selectedIds.has(edge.to)}] : [];
    });
    next.sort((a, b) => Number(a.selected) - Number(b.selected));
    setDrawn(next);
    setSize({width: content.scrollWidth, height: content.scrollHeight});
  }, [edges, selectedIds, mode, contentRef, registry]);

  useLayoutEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    const content = contentRef.current;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (content && observer) {
      observer.observe(content);
    }
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [measure, layoutVersion, contentRef]);

  // Fonts and avatars can load after the first paint; re-measure once more shortly after mount.
  useEffect(() => {
    const SETTLE_DELAY = 300;
    const timer = window.setTimeout(measure, SETTLE_DELAY);
    return () => window.clearTimeout(timer);
  }, [measure]);

  if (drawn.length === 0) {
    return null;
  }

  return (
    <svg className="connectors" width={size.width} height={size.height} aria-hidden="true">
      <defs>
        <marker id="connector-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="connectors__marker"/>
        </marker>
        <marker id="connector-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="connectors__marker connectors__marker_selected"/>
        </marker>
        <marker id="connector-diamond" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="6" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 5 L 6 0 L 12 5 L 6 10 z" className="connectors__marker"/>
        </marker>
        <marker id="connector-diamond-selected" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="6" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 5 L 6 0 L 12 5 L 6 10 z" className="connectors__marker connectors__marker_selected"/>
        </marker>
      </defs>
      {drawn.map(edge => {
        const markerEnd = markerFor(edge.kind, edge.selected);
        const labelWidth = edge.label.length * LABEL_CHAR_WIDTH + LABEL_PADDING * 2;
        return (
          <g key={edge.id} className={`connectors__edge connectors__edge_${edge.kind}${edge.selected ? ' connectors__edge_selected' : ''}`}>
            <path d={edge.path} className="connectors__line" markerEnd={markerEnd}/>
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
      })}
    </svg>
  );
};
