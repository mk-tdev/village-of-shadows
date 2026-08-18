"use client";

import { useEffect, useState } from "react";
import { fetchTimeline } from "@/lib/api";
import type { LearningDebrief, Timeline } from "@/lib/types";

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
  const [showAllTools, setShowAllTools] = useState(false);
  const [prediction] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = window.localStorage.getItem(`village-learning:${sessionId}`);
      const saved = raw ? JSON.parse(raw) : null;
      return typeof saved?.prediction === "string" ? saved.prediction : "";
    } catch {
      return "";
    }
  });

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
  const debrief = timeline.learning_debrief;

  return (
    <div className="summary">
      {debrief && (
        <LearningDebriefView
          debrief={debrief}
          prediction={prediction}
          showAllTools={showAllTools}
          onToggleTools={() => setShowAllTools((value) => !value)}
        />
      )}

      <div className="summary-divider">
        <span>TECHNICAL EVIDENCE</span>
        <p>The checkpoint history and durable event trace behind the learning conclusions.</p>
      </div>

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

function LearningDebriefView({
  debrief,
  prediction,
  showAllTools,
  onToggleTools,
}: {
  debrief: LearningDebrief;
  prediction: string;
  showAllTools: boolean;
  onToggleTools: () => void;
}) {
  const comparison = debrief.comparisons.find((item) => item.decisions.length > 1);

  return (
    <div className="learning-debrief">
      <header className="learning-debrief-hero">
        <div>
          <span className="learning-kicker">CLOSED-LOOP LEARNING</span>
          <h3>What this game demonstrated</h3>
          <p>
            The conclusions below come from this game&apos;s checkpoints, tool results,
            private/public event boundaries, and independent seat memories.
          </p>
        </div>
        <div className="learning-loop" aria-label="Learning loop">
          {['Configure', 'Predict', 'Play', 'Observe', 'Debrief', 'Compare'].map((step, index) => (
            <span key={step}><b>{String(index + 1).padStart(2, '0')}</b>{step}</span>
          ))}
        </div>
      </header>

      {prediction && (
        <section className="prediction-result">
          <span>Your prediction</span>
          <blockquote>{prediction}</blockquote>
          <p>Compare it with the evidence below. What surprised you, and what would you change in the next run?</p>
        </section>
      )}

      <section>
        <p className="debug-section-title">Concept → evidence from this run</p>
        <div className="learning-concept-grid">
          {debrief.concept_evidence.map((item) => (
            <article key={item.concept}>
              <h4>{item.concept}</h4>
              <p>{item.evidence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="learning-evidence-grid">
        <article>
          <p className="debug-section-title">Where the human entered the graph</p>
          {debrief.human_interrupts.length ? (
            <ol className="evidence-list">
              {debrief.human_interrupts.slice(0, 8).map((item) => (
                <li key={item.seq}>
                  <span>Round {item.round} · {item.phase}</span>
                  <strong>{item.action}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="summary-prose">The human died before receiving a playable turn, so no human interrupt completed in this run.</p>
          )}
        </article>

        <article>
          <p className="debug-section-title">Information boundaries</p>
          <div className="observability-split">
            <Stat label="Public events" value={String(debrief.partial_observability.public_events)} />
            <Stat label="Private events" value={String(debrief.partial_observability.private_events)} />
            <Stat label="Seer discoveries" value={String(debrief.partial_observability.seer_discoveries)} />
          </div>
          <p className="summary-prose">{debrief.partial_observability.explanation}</p>
        </article>
      </section>

      <section>
        <p className="debug-section-title">Tools called — and what validation accepted</p>
        <div className="tool-totals">
          <span><b>{debrief.tool_totals.all}</b> calls</span>
          <span className="accepted"><b>{debrief.tool_totals.accepted}</b> accepted actions</span>
          <span><b>{debrief.tool_totals.reads}</b> reads</span>
          <span className={debrief.tool_totals.rejected ? "rejected" : ""}><b>{debrief.tool_totals.rejected}</b> rejected</span>
        </div>
        {debrief.tool_calls.length ? (
          <div className="summary-table-wrap">
            <table className="metrics-table">
            <thead><tr><th>Agent</th><th>Round / phase</th><th>Tool</th><th>Result</th><th>Decision</th></tr></thead>
            <tbody>
              {(showAllTools ? debrief.tool_calls : debrief.tool_calls.slice(0, 14)).map((call, index) => (
                <tr key={`${call.seat_id}-${call.round}-${call.tool}-${index}`}>
                  <td>{call.name}<small className="learning-model">{call.model_name ?? call.provider ?? '—'}</small></td>
                  <td>{call.round} · {call.phase}</td>
                  <td><code>{call.tool}</code></td>
                  <td><span className={`tool-status ${call.status}`}>{call.status}</span></td>
                  <td>{call.summary}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        ) : (
          <p className="summary-prose">
            This run used no persisted model tool calls. Human actions still passed through the
            same rule-validation functions, but they are represented in the interrupt evidence above.
          </p>
        )}
        {debrief.tool_calls.length > 14 && (
          <button className="btn-ghost" type="button" onClick={onToggleTools}>
            {showAllTools ? "Show fewer tool calls" : `Show all ${debrief.tool_calls.length} tool calls`}
          </button>
        )}
      </section>

      <section>
        <p className="debug-section-title">How independent memories evolved</p>
        <div className="memory-growth-list">
          {debrief.memories.map((memory) => {
            const max = Math.max(...debrief.memories.map((item) => item.end_messages), 1);
            return (
              <div className="memory-growth-row" key={memory.seat_id}>
                <span><strong>{memory.name}</strong><small>{memory.model_name ?? 'model'}</small></span>
                <span className="memory-growth-track"><i style={{ width: `${(memory.end_messages / max) * 100}%` }} /></span>
                <b>{memory.start_messages} → {memory.end_messages}</b>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="debug-section-title">How private beliefs evolved</p>
        <p className="summary-prose">
          Notes are an immutable ledger: revisions and retired theories remain visible instead of
          being overwritten, with the round and evidence event that prompted each change.
        </p>
        {debrief.note_evolution.length ? (
          <ol className="private-notes-list debrief-note-list">
            {debrief.note_evolution.slice(-20).reverse().map((note) => (
              <li key={note.event_key} className={`private-note-card is-${note.status}`}>
                <div className="private-note-meta">
                  <span className={`private-note-kind kind-${note.kind}`}>{note.kind}</span>
                  <strong>{note.name ?? note.seat_id}</strong>
                  {note.subject ? <span>about {note.subject}</span> : null}
                  <span>v{note.revision}</span>
                  <span>{note.source_seq === null ? "opening belief" : `from event #${note.source_seq}`}</span>
                </div>
                <p>{note.content}</p>
                <span className="private-note-operation">{note.operation}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="summary-prose">No model committed a private notebook update in this run.</p>
        )}
      </section>

      {comparison ? (
        <section>
          <p className="debug-section-title">Same public round, different decisions</p>
          <p className="summary-prose">{comparison.context}</p>
          <div className="comparison-strip">
            {comparison.decisions.map((decision, index) => (
              <article key={`${decision.seat_id}-${decision.tool}-${index}`}>
                <span>{decision.name} · {decision.model_name ?? decision.provider}</span>
                <strong>{decision.summary}</strong>
                <small><code>{decision.tool}</code></small>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <p className="debug-section-title">Same public round, different decisions</p>
          <p className="summary-prose">
            This run did not preserve a stage with two comparable model decisions. Replay with at
            least two AI seats and keep their models different to create a useful comparison.
          </p>
        </section>
      )}

      <section className="next-experiments">
        <p className="debug-section-title">Try next</p>
        <ol>
          {debrief.next_experiments.map((experiment) => <li key={experiment}>{experiment}</li>)}
        </ol>
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
