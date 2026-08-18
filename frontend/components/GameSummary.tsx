"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchTimeline } from "@/lib/api";
import type { LearningDebrief, Timeline, TimelineSeat } from "@/lib/types";
import { BeliefMatrix } from "./BeliefMatrix";

type SummaryTab = "overview" | "learning" | "technical";

const SUMMARY_TABS: { id: SummaryTab; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Outcome and takeaways" },
  { id: "learning", label: "Learning evidence", hint: "People, tools and beliefs" },
  { id: "technical", label: "Technical trace", hint: "Graph and checkpoints" },
];

/** A focused post-game workspace. The report is divided into three views and
 * long evidence is progressively disclosed, so opening the debrief no longer
 * turns the game page into one continuous technical document. */
export function GameSummary({ sessionId }: { sessionId: string }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SummaryTab>("overview");
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
      .then((value) => {
        if (!cancelled) setTimeline(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) return <p className="metrics-empty">Could not load the technical summary: {error}</p>;
  if (!timeline) return <SummaryLoading />;
  if (!timeline.available) {
    return (
      <p className="metrics-empty">
        No checkpoint history for this game — its threads were reclaimed when it was abandoned.
      </p>
    );
  }

  return (
    <div className="summary">
      <nav className="summary-tabs" aria-label="Post-game summary views">
        {SUMMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.hint}</span>
          </button>
        ))}
      </nav>

      <div className="summary-tab-panel">
        {activeTab === "overview" ? (
          <SummaryOverview timeline={timeline} prediction={prediction} />
        ) : activeTab === "learning" ? (
          timeline.learning_debrief ? (
            <LearningEvidence
              debrief={timeline.learning_debrief}
              prediction={prediction}
              people={timeline.seats}
            />
          ) : (
            <p className="metrics-empty">No learning evidence was recorded for this game.</p>
          )
        ) : (
          <TechnicalEvidence timeline={timeline} />
        )}
      </div>
    </div>
  );
}

function SummaryLoading() {
  return (
    <div className="summary-loading" role="status">
      <span className="summary-loading-mark">◈</span>
      <div>
        <strong>Reconstructing the game</strong>
        <p>Reading orchestration checkpoints, tool calls, memories, and private evidence…</p>
      </div>
    </div>
  );
}

function SummaryOverview({ timeline, prediction }: { timeline: Timeline; prediction: string }) {
  const debrief = timeline.learning_debrief;
  const slowest = [...timeline.steps]
    .filter((step) => step.elapsed_ms !== null)
    .sort((left, right) => (right.elapsed_ms ?? 0) - (left.elapsed_ms ?? 0))[0];
  const winnerLabel = timeline.winner === "villagers" ? "The village survived" : "The shadows prevailed";

  return (
    <div className="summary-view summary-overview">
      <header className={`summary-outcome is-${timeline.winner ?? "unknown"}`}>
        <div>
          <span className="learning-kicker">GAME CONCLUDED</span>
          <h3>{winnerLabel}</h3>
          <p>
            {timeline.winner === "villagers"
              ? "The agents and human eliminated every werewolf before the village fell."
              : "The werewolves reached parity and took control of the village."}
          </p>
        </div>
        <strong>{timeline.winner ?? "unknown"}</strong>
      </header>

      <div className="summary-stats summary-stats-primary">
        <Stat label="Rounds" value={String(timeline.rounds ?? "—")} />
        <Stat label="Human turns" value={String(debrief?.human_interrupts.length ?? 0)} />
        <Stat label="Model tool calls" value={String(debrief?.tool_totals.all ?? 0)} />
        <Stat label="Private events" value={String(debrief?.partial_observability.private_events ?? 0)} />
        <Stat label="Scored belief changes" value={String(debrief?.belief_evolution.length ?? 0)} />
        <Stat
          label="Wall clock"
          value={timeline.duration_ms != null ? `${(timeline.duration_ms / 1000).toFixed(2)}s` : "—"}
        />
      </div>

      {prediction ? (
        <section className="prediction-result">
          <span>Your prediction</span>
          <blockquote>{prediction}</blockquote>
          <p>Compare it with the evidence below. What surprised you?</p>
        </section>
      ) : null}

      {debrief ? (
        <>
          <section>
            <div className="summary-section-heading">
              <div>
                <span>WHAT THIS RUN PROVED</span>
                <h3>Agentic concepts, backed by evidence</h3>
              </div>
              <p>Open Learning evidence for the complete trace behind each conclusion.</p>
            </div>
            <div className="learning-concept-grid">
              {debrief.concept_evidence.map((item) => (
                <article key={item.concept}>
                  <h4>{item.concept}</h4>
                  <p>{item.evidence}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="summary-next-move">
            <div>
              <span className="learning-kicker">NEXT EXPERIMENT</span>
              <h3>Change one variable. Play again.</h3>
              <p>{debrief.next_experiments[0] ?? "Replay with a different model and compare the outcome."}</p>
            </div>
            <div className="summary-mini-trace">
              <span><b>{timeline.total_steps ?? 0}</b> graph steps</span>
              <span><b>{timeline.events.length}</b> persisted events</span>
              <span><b>{slowest?.elapsed_ms ?? 0}ms</b> slowest step</span>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function LearningEvidence({
  debrief,
  prediction,
  people,
}: {
  debrief: LearningDebrief;
  prediction: string;
  people: TimelineSeat[];
}) {
  const [showAllTools, setShowAllTools] = useState(false);
  const comparison = debrief.comparisons.find((item) => item.decisions.length > 1);
  const maxMemory = Math.max(...debrief.memories.map((item) => item.end_messages), 1);

  return (
    <div className="summary-view learning-evidence-view">
      <header className="summary-section-heading is-hero">
        <div>
          <span>CLOSED-LOOP LEARNING</span>
          <h3>Follow the evidence, not a wall of text</h3>
        </div>
        <p>Expand one evidence group at a time. Every statement below comes from persisted behavior.</p>
      </header>

      {prediction ? (
        <div className="summary-prediction-chip"><span>Prediction</span>{prediction}</div>
      ) : null}

      <div className="summary-disclosure-list">
        <Disclosure title="Human participation and information boundaries" meta={`${debrief.human_interrupts.length} human turns`} open>
          <div className="learning-evidence-grid">
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
                <p className="summary-prose">The human died before receiving a playable turn.</p>
              )}
            </article>
            <article>
              <p className="debug-section-title">What remained private</p>
              <div className="observability-split">
                <Stat label="Public" value={String(debrief.partial_observability.public_events)} />
                <Stat label="Private" value={String(debrief.partial_observability.private_events)} />
                <Stat label="Seer finds" value={String(debrief.partial_observability.seer_discoveries)} />
              </div>
              <p className="summary-prose">{debrief.partial_observability.explanation}</p>
            </article>
          </div>
        </Disclosure>

        <Disclosure title="Tool calls and rule validation" meta={`${debrief.tool_totals.accepted} accepted · ${debrief.tool_totals.rejected} rejected`}>
          <div className="tool-totals">
            <span><b>{debrief.tool_totals.all}</b> calls</span>
            <span className="accepted"><b>{debrief.tool_totals.accepted}</b> accepted actions</span>
            <span><b>{debrief.tool_totals.reads}</b> reads</span>
            <span className={debrief.tool_totals.rejected ? "rejected" : ""}><b>{debrief.tool_totals.rejected}</b> rejected</span>
          </div>
          {debrief.tool_calls.length ? (
            <div className="summary-table-wrap summary-evidence-table">
              <table className="metrics-table">
                <thead><tr><th>Agent</th><th>Round / phase</th><th>Tool</th><th>Result</th><th>Decision</th></tr></thead>
                <tbody>
                  {(showAllTools ? debrief.tool_calls : debrief.tool_calls.slice(0, 12)).map((call, index) => (
                    <tr key={`${call.seat_id}-${call.round}-${call.tool}-${index}`}>
                      <td>{call.name}<small className="learning-model">{call.model_name ?? call.provider ?? "—"}</small></td>
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
            <p className="summary-prose">No persisted model tool calls were recorded.</p>
          )}
          {debrief.tool_calls.length > 12 ? (
            <button className="btn-ghost" type="button" onClick={() => setShowAllTools((value) => !value)}>
              {showAllTools ? "Show fewer calls" : `Show all ${debrief.tool_calls.length} calls`}
            </button>
          ) : null}
        </Disclosure>

        <Disclosure title="Independent memories" meta={`${debrief.memories.length} seat minds`}>
          <div className="memory-growth-list">
            {debrief.memories.map((memory) => (
              <div className="memory-growth-row" key={memory.seat_id}>
                <span><strong>{memory.name}</strong><small>{memory.model_name ?? "model"}</small></span>
                <span className="memory-growth-track"><i style={{ width: `${(memory.end_messages / maxMemory) * 100}%` }} /></span>
                <b>{memory.start_messages} → {memory.end_messages}</b>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Trust and suspicion replay" meta={`${debrief.belief_evolution.length} scored revisions`}>
          <p className="summary-prose">
            Each score is private to its observer. The matrix shows final positions; the cards replay the evidence-backed changes in reverse order.
          </p>
          <BeliefMatrix people={people} events={debrief.belief_evolution} historyLimit={20} />
        </Disclosure>

        <Disclosure title="Private belief evolution" meta={`${debrief.note_evolution.length} revisions`}>
          <p className="summary-prose">
            Revisions and retired theories remain visible, with the evidence event that prompted each change.
          </p>
          {debrief.note_evolution.length ? (
            <ol className="private-notes-list summary-note-list">
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
        </Disclosure>

        <Disclosure title="Same evidence, different decisions" meta={comparison ? `${comparison.decisions.length} agents compared` : "No comparable stage"}>
          {comparison ? (
            <>
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
            </>
          ) : (
            <p className="summary-prose">Replay with at least two differently configured AI seats to create a useful comparison.</p>
          )}
        </Disclosure>

        <Disclosure title="Experiments for the next run" meta={`${debrief.next_experiments.length} suggestions`}>
          <div className="next-experiments is-embedded">
            <ol>{debrief.next_experiments.map((experiment) => <li key={experiment}>{experiment}</li>)}</ol>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

function TechnicalEvidence({ timeline }: { timeline: Timeline }) {
  const [showAllSteps, setShowAllSteps] = useState(false);
  const steps = showAllSteps ? timeline.steps : timeline.steps.slice(0, 14);

  return (
    <div className="summary-view technical-evidence-view">
      <header className="summary-section-heading is-hero">
        <div>
          <span>TECHNICAL EVIDENCE</span>
          <h3>The trace is here when you need it</h3>
        </div>
        <p>Graph mechanics are separated from the narrative and collapsed by default.</p>
      </header>

      <div className="summary-stats">
        <Stat label="Graph steps" value={String(timeline.total_steps ?? "—")} />
        <Stat label="Log entries" value={String(timeline.events.length)} />
        <Stat label="Phases" value={String(timeline.phases?.length ?? 0)} />
        <Stat label="Seat agents" value={String(timeline.seats.length)} />
      </div>

      <div className="summary-disclosure-list">
        <Disclosure title="How to read this trace" meta="Important caveat">
          <p className="summary-caveat">{timeline.caveat}</p>
        </Disclosure>

        <Disclosure title="Game lifecycle" meta={`${timeline.phases?.length ?? 0} transitions`} open>
          <p className="summary-prose">
            The graph waited in <code>phase: lobby</code> until the human pressed Start Game. Roles were dealt inside the graph.
          </p>
          <ul className="summary-phases">
            {(timeline.phases ?? []).map((phase) => (
              <li key={phase.label}>
                <span className="summary-phase-step">step {phase.from_step}</span>
                <span className="summary-phase-label">{phase.label}</span>
              </li>
            ))}
          </ul>
        </Disclosure>

        <Disclosure title="Node execution counts" meta={`${timeline.node_counts?.length ?? 0} graph nodes`}>
          <div className="summary-bars">
            {(timeline.node_counts ?? []).map((node) => {
              const max = timeline.node_counts?.[0]?.count ?? 1;
              return (
                <div className="summary-bar-row" key={node.node}>
                  <span className="summary-bar-label">{node.node}</span>
                  <span className="summary-bar-track"><span className="summary-bar-fill" style={{ width: `${(node.count / max) * 100}%` }} /></span>
                  <span className="summary-bar-count">{node.count}</span>
                </div>
              );
            })}
          </div>
        </Disclosure>

        <Disclosure title="Checkpoint history" meta={`${timeline.steps.length} stages`}>
          <div className="summary-table-wrap summary-evidence-table">
            <table className="metrics-table">
              <thead><tr><th className="num">Step</th><th>Next node</th><th>Phase</th><th className="num">Round</th><th className="num">Alive</th><th className="num">Log</th><th className="num">+ms</th></tr></thead>
              <tbody>
                {steps.map((step) => (
                  <tr key={step.step}>
                    <td className="num">{step.step}</td><td><code>{step.next_node ?? "—"}</code></td><td>{step.phase ?? "—"}</td>
                    <td className="num">{step.round ?? "—"}</td><td className="num">{step.alive ?? "—"}</td>
                    <td className="num">{step.log_count ?? "—"}</td><td className="num">{step.elapsed_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {timeline.steps.length > 14 ? (
            <button className="btn-ghost" type="button" onClick={() => setShowAllSteps((value) => !value)}>
              {showAllSteps ? "Show fewer stages" : `Show all ${timeline.steps.length} stages`}
            </button>
          ) : null}
        </Disclosure>

        <Disclosure title="Per-seat agent threads" meta={`${timeline.seats.length} seats`}>
          <p className="summary-prose">Each AI seat has an independent checkpoint thread and conversation memory.</p>
          <div className="summary-table-wrap">
            <table className="metrics-table">
              <thead><tr><th>Seat</th><th>Role</th><th>Controller</th><th>Model</th><th className="num">Turns</th><th className="num">Mem</th><th className="num">Ckpt</th></tr></thead>
              <tbody>
                {timeline.seats.map((seat) => (
                  <tr key={seat.seat_id} className={seat.alive ? "" : "summary-dead"}>
                    <td>{seat.name}{seat.alive ? null : <span className="summary-dead-tag">died</span>}</td>
                    <td>{seat.role ?? "—"}</td><td>{seat.controller}</td>
                    <td>{seat.controller === "human" ? "—" : seat.model_name ?? seat.provider ?? "—"}</td>
                    <td className="num">{seat.turns}</td><td className="num">{seat.controller === "human" ? "—" : seat.memory_messages}</td>
                    <td className="num">{seat.controller === "human" ? "—" : seat.memory_checkpoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

function Disclosure({
  title,
  meta,
  open = false,
  children,
}: {
  title: string;
  meta: string;
  open?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(open);

  return (
    <details
      className="summary-disclosure"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span><strong>{title}</strong><small>{meta}</small></span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className="summary-disclosure-content">{children}</div>
    </details>
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
