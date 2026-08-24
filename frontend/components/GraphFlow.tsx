"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

const MAIN_X = 250;
const END_X = 420;

// Hand-positioned layout matching the graph's own docstring shape
// (backend/app/game/graph.py) -- the node set is fixed and small, so a
// real auto-layout algorithm would be more machinery than the diagram is
// worth. Any node the backend adds that isn't in this table still renders,
// just stacked below the rest, so a graph change never breaks the panel.
const POSITIONS: Record<string, { x: number; y: number }> = {
  __start__: { x: MAIN_X, y: 24 },
  assign_roles: { x: MAIN_X, y: 76 },
  start_night: { x: MAIN_X, y: 128 },
  night_wolves: { x: MAIN_X, y: 180 },
  night_doctor: { x: MAIN_X, y: 232 },
  night_seer: { x: MAIN_X, y: 284 },
  resolve_night: { x: MAIN_X, y: 336 },
  check_win_night: { x: MAIN_X, y: 388 },
  start_day: { x: MAIN_X, y: 440 },
  day_discussion: { x: MAIN_X, y: 492 },
  start_vote: { x: MAIN_X, y: 544 },
  voting: { x: MAIN_X, y: 596 },
  resolve_vote: { x: MAIN_X, y: 648 },
  check_win_vote: { x: MAIN_X, y: 700 },
  __end__: { x: END_X, y: 544 },
};

const SELF_LOOP_NODES = new Set(["night_wolves", "day_discussion", "voting"]);

const BOX_W = 168;
const BOX_H = 30;
const VIEW_H = 740;
const VIEW_W = 520;

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

function nodePos(id: string, fallbackIndex: number): { x: number; y: number } {
  return POSITIONS[id] ?? { x: 60, y: 24 + fallbackIndex * 40 };
}

function label(name: string): string {
  if (name === "__start__") return "START";
  if (name === "__end__") return "END";
  return name;
}

interface View {
  x: number;
  y: number;
  k: number;
}

/** Pan/zoom is implemented with plain CSS transforms on the SVG element
 * itself (translate then scale, transform-origin 0 0) rather than by
 * rewriting the SVG's viewBox -- that keeps every coordinate here in the
 * same screen-pixel space as pointer events, so panning is a direct 1:1
 * drag with no unit conversion, and zooming toward a point (cursor or
 * center) is the standard "keep that point fixed" formula below. No
 * pan/zoom library needed for a canvas this small. */
export function GraphFlow({
  nodes,
  edges,
  currentNode,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNode: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerId = `graph-arrow-${useId().replaceAll(":", "")}`;
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(
    null
  );
  const firedFitOnce = useRef(false);

  const fitView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const k = clampScale(Math.min(rect.width / VIEW_W, rect.height / VIEW_H) * 0.94);
    setView({
      x: (rect.width - VIEW_W * k) / 2,
      y: (rect.height - VIEW_H * k) / 2,
      k,
    });
  }, []);

  useEffect(() => {
    if (nodes.length === 0 || firedFitOnce.current) return;
    firedFitOnce.current = true;
    fitView();
  }, [nodes, fitView]);

  const zoomToward = useCallback((factor: number, screenX: number, screenY: number) => {
    setView((v) => {
      const kNew = clampScale(v.k * factor);
      const localX = (screenX - v.x) / v.k;
      const localY = (screenY - v.y) / v.k;
      return { x: screenX - kNew * localX, y: screenY - kNew * localY, k: kNew };
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomToward(factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    [zoomToward]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: view.x, startY: view.y };
      setDragging(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [view.x, view.y]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Capture the drag-start snapshot into a local const rather than
    // re-reading dragRef.current inside the setView updater: React can
    // defer/batch that updater until after a pointerup in the same gesture
    // has already run endDrag() and nulled the ref, which would throw on
    // dragRef.current!.startX with no way to guard against it there.
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    setView((v) => ({ ...v, x: drag.startX + dx, y: drag.startY + dy }));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const zoomButton = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomToward(factor, rect.width / 2, rect.height / 2);
    },
    [zoomToward]
  );

  if (nodes.length === 0) {
    return <p className="metrics-empty">Loading graph structure...</p>;
  }

  return (
    <div className="graph-flow-canvas-outer">
      <div className="graph-zoom-controls">
        <button type="button" className="graph-zoom-btn" onClick={() => zoomButton(1.3)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="graph-zoom-btn" onClick={() => zoomButton(1 / 1.3)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="graph-zoom-btn" onClick={fitView} aria-label="Fit to view" title="Fit to view">
          ⤾
        </button>
      </div>
      <div
        ref={containerRef}
        className={`graph-flow-canvas ${dragging ? "dragging" : ""}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        <svg
          className="graph-flow-svg"
          width={VIEW_W}
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--card-border-strong)" />
            </marker>
          </defs>

          {edges
            .filter((e) => e.source !== e.target)
            .map((e, i) => {
              const from = nodePos(e.source, 0);
              const to = nodePos(e.target, 0);
              return (
                <line
                  key={`${e.source}-${e.target}-${i}`}
                  className={`graph-edge ${e.conditional ? "conditional" : ""}`}
                  x1={from.x}
                  y1={from.y + BOX_H / 2}
                  x2={to.x}
                  y2={to.y - BOX_H / 2}
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}

          {nodes.map((n, i) => {
            const pos = nodePos(n.id, i);
            const active = n.id === currentNode;
            const isTerminal = n.id === "__start__" || n.id === "__end__";
            const width = isTerminal ? 70 : BOX_W;
            return (
              <g key={n.id}>
                <rect
                  className={`graph-node-box ${active ? "active" : ""}`}
                  x={pos.x - width / 2}
                  y={pos.y - BOX_H / 2}
                  width={width}
                  height={BOX_H}
                  rx={isTerminal ? 15 : 7}
                />
                <text
                  className={`graph-node-label ${active ? "active" : ""}`}
                  x={pos.x}
                  y={pos.y + 3}
                  textAnchor="middle"
                >
                  {label(n.name)}
                </text>
                {SELF_LOOP_NODES.has(n.id) && (
                  <text className="graph-node-loop" x={pos.x + BOX_W / 2 + 8} y={pos.y + 3}>
                    ↻ per seat
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
