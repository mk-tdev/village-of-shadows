"use client";

import { useEffect, useState } from "react";
import { fetchGraphStructure } from "@/lib/api";
import type { GraphStructure, SeatMetrics } from "@/lib/types";
import { GraphFlow } from "./GraphFlow";

/** Collapsible engineering debug panel: the live LangGraph orchestration
 * graph (introspected from the compiled graph itself -- see
 * routers/graph.py -- with the currently-executing node highlighted from
 * "node" SSE events) and a per-agent token/latency metrics table
 * (accumulated from "decision" SSE events emitted in agent_turn.py). This
 * is the part of the project meant to showcase the agentic-engineering
 * internals, not just play the game. */
export function DebugPanel({
  currentNode,
  metrics,
}: {
  currentNode: string | null;
  metrics: Record<string, SeatMetrics>;
}) {
  const [open, setOpen] = useState(false);
  const [graph, setGraph] = useState<GraphStructure | null>(null);

  useEffect(() => {
    if (open && !graph) {
      fetchGraphStructure().then(setGraph).catch(() => {});
    }
  }, [open, graph]);

  const rows = Object.values(metrics).sort((a, b) => a.name.localeCompare(b.name));
  const totalIn = rows.reduce((sum, r) => sum + r.input_tokens, 0);
  const totalOut = rows.reduce((sum, r) => sum + r.output_tokens, 0);

  if (!open) {
    return (
      <button className="debug-toggle" onClick={() => setOpen(true)}>
        <span>⚙</span> Debug
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <h2 className="debug-panel-title">Agent Engineering Debug</h2>
        <button className="debug-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>

      <div>
        <p className="debug-section-title">LangGraph orchestration flow</p>
        <div className="graph-flow-wrap">
          <GraphFlow nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} currentNode={currentNode} />
        </div>
      </div>

      <div>
        <p className="debug-section-title">
          Agent token &amp; context usage {totalIn + totalOut > 0 && <span>({totalIn} in / {totalOut} out total)</span>}
        </p>
        {rows.length === 0 ? (
          <p className="metrics-empty">No agent calls yet this game.</p>
        ) : (
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Model</th>
                <th className="num">Calls</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num">Last ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.seat_id}>
                  <td>{r.name}</td>
                  <td>
                    {r.model_name ?? r.provider ?? "-"}
                    {r.estimated && <span className="metrics-estimated">est.</span>}
                  </td>
                  <td className="num">{r.calls}</td>
                  <td className="num">{r.input_tokens}</td>
                  <td className="num">{r.output_tokens}</td>
                  <td className="num">{r.last_latency_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
