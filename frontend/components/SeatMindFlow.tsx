"use client";

import type { GraphEdge, GraphNode } from "@/lib/types";

const BOX_W = 130;
const BOX_H = 28;
const ROW_H = 48;
const TOP = 24;
const COL_X = 82;
const VIEW_W = 380;

/** `ingest` branches: a normal turn goes to `deliberate`, a turn being replayed
 * after a pause goes to `reapply` instead (see seat_mind.py). Ordering by this
 * known sequence keeps the diagram readable; anything the backend adds later
 * falls to the end rather than breaking the panel. */
const ORDER = ["__start__", "ingest", "deliberate", "reapply", "__end__"];

/** Short notes on what each node is for. The node names alone ("ingest",
 * "deliberate") don't convey much to someone reading the panel to understand
 * the architecture, which is the whole point of showing this. */
const NOTES: Record<string, string> = {
  ingest: "seeds persona once, adds this turn's briefing",
  deliberate: "model + MCP tool loop, continuing memory",
  reapply: "replayed turn: re-acts, doesn't re-remember",
};

/** Deliberately *not* rendered through `GraphFlow`. That component carries a
 * hand-positioned layout table for the 15-node game graph plus pan/zoom
 * pointer handling; this subgraph is four nodes in a straight line, so
 * reusing it would mean parameterising a working component (with a fiddly
 * drag implementation — see docs/concepts/10) to gain nothing visible. Same
 * CSS classes, so the two diagrams still read as one system. */
export function SeatMindFlow({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  if (nodes.length === 0) {
    return <p className="metrics-empty">No seat-mind subgraph reported by the backend.</p>;
  }

  const rank = (id: string) => {
    const i = ORDER.indexOf(id);
    return i === -1 ? ORDER.length : i;
  };
  const sorted = [...nodes].sort((a, b) => rank(a.id) - rank(b.id));

  const pos: Record<string, { x: number; y: number; row: number }> = {};
  sorted.forEach((n, i) => {
    pos[n.id] = { x: COL_X, y: TOP + i * ROW_H, row: i };
  });

  const height = TOP + (sorted.length - 1) * ROW_H + BOX_H;

  return (
    <svg
      className="graph-flow-svg"
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="xMinYMin meet"
      role="img"
      aria-label="Per-seat agent subgraph"
    >
      <defs>
        <marker
          id="mind-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--card-border-strong)" />
        </marker>
      </defs>

      {edges
        .filter((e) => e.source !== e.target && pos[e.source] && pos[e.target])
        .map((e, i) => {
          const from = pos[e.source];
          const to = pos[e.target];
          const skips = Math.abs(to.row - from.row) > 1;
          const key = `${e.source}-${e.target}-${i}`;
          const cls = `graph-edge ${e.conditional ? "conditional" : ""}`;

          // An edge that skips a row (the replay shortcut) would run straight
          // through the node in between, so bow it out to the left instead.
          if (skips) {
            const bow = COL_X - BOX_W / 2 - 34;
            return (
              <path
                key={key}
                className={cls}
                fill="none"
                d={`M ${from.x - BOX_W / 2} ${from.y}
                    C ${bow} ${from.y}, ${bow} ${to.y}, ${to.x - 33} ${to.y}`}
                markerEnd="url(#mind-arrow)"
              />
            );
          }

          return (
            <line
              key={key}
              className={cls}
              x1={from.x}
              y1={from.y + BOX_H / 2}
              x2={to.x}
              y2={to.y - BOX_H / 2}
              markerEnd="url(#mind-arrow)"
            />
          );
        })}

      {sorted.map((n) => {
        const p = pos[n.id];
        const isTerminal = n.id === "__start__" || n.id === "__end__";
        const width = isTerminal ? 66 : BOX_W;
        const text = n.id === "__start__" ? "START" : n.id === "__end__" ? "END" : n.name;
        return (
          <g key={n.id}>
            <rect
              className="graph-node-box"
              x={p.x - width / 2}
              y={p.y - BOX_H / 2}
              width={width}
              height={BOX_H}
              rx={isTerminal ? 14 : 7}
            />
            <text className="graph-node-label" x={p.x} y={p.y + 3} textAnchor="middle">
              {text}
            </text>
            {NOTES[n.id] && (
              <text className="graph-node-loop" x={p.x + width / 2 + 10} y={p.y + 3}>
                {NOTES[n.id]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
