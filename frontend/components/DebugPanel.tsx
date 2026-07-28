"use client";

import { useEffect, useState } from "react";
import { fetchGraphStructure } from "@/lib/api";
import type { ActivityEntry, GraphStructure, SeatMetrics } from "@/lib/types";
import { GraphFlow } from "./GraphFlow";

const ACTIVITY_ICON: Record<ActivityEntry["kind"], string> = {
  node: "⚙",
  turn: "▶",
  mcp: "⇄",
  decision: "✓",
};

/** Engineering debug panel, embedded directly in the page (not a sliding
 * overlay) so the live LangGraph orchestration graph (introspected from the
 * compiled graph itself -- see routers/graph.py -- with the
 * currently-executing node highlighted from "node" SSE events) and the
 * per-agent token/latency metrics table (accumulated from "decision" SSE
 * events emitted in agent_turn.py) are both visible to watch update live
 * while a game plays, with no click required to reveal them. This is the
 * part of the project meant to showcase the agentic-engineering internals,
 * not just play the game. */
export function DebugPanel({
  currentNode,
  metrics,
  activity,
}: {
  currentNode: string | null;
  metrics: Record<string, SeatMetrics>;
  activity: ActivityEntry[];
}) {
  const [graph, setGraph] = useState<GraphStructure | null>(null);

  useEffect(() => {
    fetchGraphStructure().then(setGraph).catch(() => {});
  }, []);

  const rows = Object.values(metrics).sort((a, b) => a.name.localeCompare(b.name));
  const totalIn = rows.reduce((sum, r) => sum + r.input_tokens, 0);
  const totalOut = rows.reduce((sum, r) => sum + r.output_tokens, 0);

  return (
    <section className="debug-panel">
      <div className="debug-panel-header">
        <h2 className="debug-panel-title">
          <span>⚙</span> Agent Engineering Debug
        </h2>
      </div>

      <div className="debug-panel-body">
        <div>
          <p className="debug-section-title">LangGraph orchestration flow — drag to pan, scroll to zoom</p>
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

          {/* Uses the empty space below the metrics table -- everything
              above this is unchanged. Answers exactly what the graph
              diagram and metrics table don't: which agent is active right
              now, when the orchestrator moves between nodes, and when MCP
              sessions/tool calls actually happen, as a live scrolling feed
              instead of only an end-of-turn summary. */}
          <p className="debug-section-title" style={{ marginTop: 20 }}>
            Live activity
          </p>
          {activity.length === 0 ? (
            <p className="metrics-empty">Nothing has happened yet this game.</p>
          ) : (
            <ul className="activity-feed">
              {activity.map((entry) => (
                <li key={entry.id} className={`activity-entry activity-${entry.kind}`}>
                  <span className="activity-icon">{ACTIVITY_ICON[entry.kind]}</span>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
