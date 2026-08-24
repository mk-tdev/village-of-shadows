"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ActivityEntry, GraphStructure, MindNodeEvent } from "@/lib/types";
import { GraphFlow } from "./GraphFlow";
import { SeatMindFlow } from "./SeatMindFlow";

export function GraphInspectorModal({
  open,
  graph,
  currentNode,
  mindNode,
  mindNodeCounts,
  activity,
  onClose,
}: {
  open: boolean;
  graph: GraphStructure | null;
  currentNode: string | null;
  mindNode: MindNodeEvent | null;
  mindNodeCounts: Record<string, number>;
  activity: ActivityEntry[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const nodeTrail = activity.filter((entry) => entry.kind === "node").slice(-18).reverse();

  return createPortal(
    <div className="graph-inspector-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="graph-inspector" role="dialog" aria-modal="true" aria-labelledby="graph-inspector-title">
        <header className="graph-inspector-header">
          <div>
            <span>LIVE LANGGRAPH EXECUTION</span>
            <h2 id="graph-inspector-title">The world graph, unobstructed.</h2>
            <p>Pan and zoom the compiled graph while the execution rail records every transition.</p>
          </div>
          <div className="graph-inspector-current">
            <small>CURRENT NODE</small>
            <strong><i aria-hidden="true" />{currentNode ?? "waiting for execution"}</strong>
          </div>
          <button ref={closeRef} className="graph-inspector-close" type="button" onClick={onClose} aria-label="Close expanded graph">×</button>
        </header>

        <div className="graph-inspector-layout">
          <div className="graph-inspector-canvas">
            <div className="graph-inspector-canvas-labels">
              <span>MAIN ORCHESTRATION</span>
              <div className="graph-inspector-legend" aria-label="Graph legend">
                <small><i className="is-active" /> executing</small>
                <small><i /> node</small>
                <small><i className="is-route" /> conditional route</small>
              </div>
            </div>
            <GraphFlow nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} currentNode={currentNode} />
          </div>

          <aside className="graph-inspector-rail">
            <section>
              <div className="graph-rail-heading">
                <span>EXECUTION TRAIL</span>
                <small>{nodeTrail.length} recent transitions</small>
              </div>
              {nodeTrail.length === 0 ? <p className="metrics-empty">The graph has not moved yet.</p> : (
                <ol className="graph-execution-trail">
                  {nodeTrail.map((entry, index) => (
                    <li key={entry.id} className={index === 0 ? "is-current" : ""}>
                      <i aria-hidden="true" />
                      <span><small>STEP {String(nodeTrail.length - index).padStart(2, "0")}</small><strong>{entry.text}</strong></span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="graph-agent-subgraph">
              <div className="graph-rail-heading">
                <span>ACTIVE AGENT MIND</span>
                <small>{mindNode ? `${mindNode.name} · ${mindNode.node}` : "waiting"}</small>
              </div>
              <SeatMindFlow
                nodes={graph?.seat_mind?.nodes ?? []}
                edges={graph?.seat_mind?.edges ?? []}
                currentNode={mindNode?.node}
                counts={mindNodeCounts}
              />
            </section>

            <footer>
              <span>READING THE VIEW</span>
              <p>The glowing node is executing now. Dashed routes are conditional. Loop counts show repeated agent turns rather than duplicated nodes.</p>
            </footer>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}
