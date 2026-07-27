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

function nodePos(id: string, fallbackIndex: number): { x: number; y: number } {
  return POSITIONS[id] ?? { x: 60, y: 24 + fallbackIndex * 40 };
}

function label(name: string): string {
  if (name === "__start__") return "START";
  if (name === "__end__") return "END";
  return name;
}

export function GraphFlow({
  nodes,
  edges,
  currentNode,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNode: string | null;
}) {
  if (nodes.length === 0) {
    return <p className="metrics-empty">Loading graph structure...</p>;
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height={420}>
      <defs>
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
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
              markerEnd="url(#graph-arrow)"
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
  );
}
