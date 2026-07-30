"use client";

import { useEffect, useState } from "react";
import { fetchTimeline } from "@/lib/api";
import type { Timeline } from "@/lib/types";

/** Post-game technical report, read out of the LangGraph checkpointer via time
 * travel (see backend/app/game/timeline.py).
 *
 * Fetched only once a game has actually ended, rather than streamed during
 * play, because that's the honest shape of the data: none of it is recorded as
 * the game runs. The checkpoints exist to make `interrupt()` durable, and this
 * view is a second reading of them after the fact.
 *
 * The layout deliberately separates graph mechanics (node order, counts,
 * timing — reliable) from the event narrative (taken from the game log, which
 * is authoritative). The backend's `caveat` explains why those two can't be
 * merged into one tidy per-step story; it's rendered rather than hidden. */
export function GameSummary({ sessionId }: { sessionId: string }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTimeline(sessionId)
      .then((t) => {
        if (!cancelled) setTimeline(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) return <p className="metrics-empty">Could not load the technical summary: {error}</p>;
  if (!timeline) return <p className="metrics-empty">Reading the checkpoint history...</p>;
  if (!timeline.available) {
    return (
      <p className="metrics-empty">
        No checkpoint history for this game — its threads were reclaimed when it was abandoned.
      </p>
    );
  }

  const steps = showAllSteps ? timeline.steps : timeline.steps.slice(0, 14);
  const slowest = [...timeline.steps]
    .filter((s) => s.elapsed_ms !== null)
    .sort((a, b) => (b.elapsed_ms ?? 0) - (a.elapsed_ms ?? 0))[0];

  return (
    <div className="summary">
      <div className="summary-stats">
        <Stat label="Outcome" value={timeline.winner ?? "—"} />
        <Stat label="Rounds" value={String(timeline.rounds ?? "—")} />
        <Stat label="Graph steps" value={String(timeline.total_steps ?? "—")} />
        <Stat
          label="Wall clock"
          value={timeline.duration_ms != null ? `${(timeline.duration_ms / 1000).toFixed(2)}s` : "—"}
        />
        <Stat label="Log entries" value={String(timeline.events.length)} />
        <Stat
          label="Slowest step"
          value={slowest ? `${slowest.next_node} ${slowest.elapsed_ms}ms` : "—"}
        />
      </div>

      <p className="summary-caveat">{timeline.caveat}</p>

      <section>
        <p className="debug-section-title">How the game started</p>
        <p className="summary-prose">
          Seven seats were configured, then the graph sat unstarted at{" "}
          <code>phase: lobby</code> until a human pressed <strong>Start Game</strong> — the
          first checkpoint below is that idle state, before <code>assign_roles</code> had run.
          Roles are dealt inside the graph, not at setup, which is why step 0 shows no roles yet.
        </p>
        <ul className="summary-phases">
          {(timeline.phases ?? []).map((p) => (
            <li key={p.label}>
              <span className="summary-phase-step">step {p.from_step}</span>
              <span className="summary-phase-label">{p.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="debug-section-title">Node executions — the conditional self-edges, counted</p>
        <p className="summary-prose">
          One node execution per seat, per turn. The repeats are the self-loops from{" "}
          <code>graph.py</code> resolving at runtime: one <code>day_discussion</code> per living
          speaker, one <code>voting</code> per voter, one <code>night_wolves</code> per wolf.
        </p>
        <div className="summary-bars">
          {(timeline.node_counts ?? []).map((n) => {
            const max = timeline.node_counts?.[0]?.count ?? 1;
            return (
              <div className="summary-bar-row" key={n.node}>
                <span className="summary-bar-label">{n.node}</span>
                <span className="summary-bar-track">
                  <span className="summary-bar-fill" style={{ width: `${(n.count / max) * 100}%` }} />
                </span>
                <span className="summary-bar-count">{n.count}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="debug-section-title">Stage by stage, from the checkpoint history</p>
        <div className="summary-table-wrap">
          <table className="metrics-table">
            <thead>
              <tr>
                <th className="num">Step</th>
                <th>Next node</th>
                <th>Phase</th>
                <th className="num">Round</th>
                <th className="num">Alive</th>
                <th className="num">Log</th>
                <th className="num">+ms</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.step}>
                  <td className="num">{s.step}</td>
                  <td><code>{s.next_node ?? "—"}</code></td>
                  <td>{s.phase ?? "—"}</td>
                  <td className="num">{s.round ?? "—"}</td>
                  <td className="num">{s.alive ?? "—"}</td>
                  <td className="num">{s.log_count ?? "—"}</td>
                  <td className="num">{s.elapsed_ms ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {timeline.steps.length > 14 && (
          <button className="btn-ghost" type="button" onClick={() => setShowAllSteps((v) => !v)}>
            {showAllSteps ? "Show fewer steps" : `Show all ${timeline.steps.length} steps`}
          </button>
        )}
      </section>

      <section>
        <p className="debug-section-title">Per-seat agents</p>
        <p className="summary-prose">
          Each AI seat ran as its own subgraph under its own checkpoint thread, so its memory is
          independent. <strong>Mem</strong> is how many messages that agent ended up reasoning
          over; <strong>Ckpt</strong> is how many checkpoints its thread accumulated — several per
          turn, not one, since every node it passes through writes one.
        </p>
        <div className="summary-table-wrap">
          <table className="metrics-table">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Role</th>
                <th>Controller</th>
                <th>Model</th>
                <th className="num">Turns</th>
                <th className="num">Mem</th>
                <th className="num">Ckpt</th>
              </tr>
            </thead>
            <tbody>
              {timeline.seats.map((s) => (
                <tr key={s.seat_id} className={s.alive ? "" : "summary-dead"}>
                  <td>{s.name}{!s.alive && <span className="summary-dead-tag">died</span>}</td>
                  <td>{s.role ?? "—"}</td>
                  <td>{s.controller}</td>
                  <td>{s.controller === "human" ? "—" : s.model_name ?? s.provider ?? "—"}</td>
                  <td className="num">{s.turns}</td>
                  <td className="num">{s.controller === "human" ? "—" : s.memory_messages}</td>
                  <td className="num">{s.controller === "human" ? "—" : s.memory_checkpoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-stat">
      <span className="summary-stat-label">{label}</span>
      <span className="summary-stat-value">{value}</span>
    </div>
  );
}
