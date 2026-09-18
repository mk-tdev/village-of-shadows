"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchCheckpointInspection, type CheckpointInspection } from "@/lib/api";
import type { GameAccessCredentials } from "@/lib/types";
import { stateChanges } from "@/lib/state-changes";
import { Select } from "./Select";
import styles from "./state-inspector.module.css";

function JsonTree({ value, label, depth = 0 }: { value: unknown; label: string; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  if (value === null || typeof value !== "object") return <div className={styles.leaf}><b>{label}</b><span>{typeof value === "string" ? value : JSON.stringify(value) ?? "[not present]"}</span></div>;
  const entries = Object.entries(value);
  return <details className={styles.tree} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{label} <small>{Array.isArray(value) ? `${entries.length} items` : `${entries.length} fields`}</small></summary>
    {expanded && entries.map(([key, item]) => <JsonTree key={key} label={key} value={item} depth={depth + 1} />)}
  </details>;
}

export function StateInspector({ sessionId, access }: { sessionId: string; access?: GameAccessCredentials }) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!expanded) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [expanded]);
  const [seat, setSeat] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [data, setData] = useState<CheckpointInspection | null>(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState("state");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      setBusy(true);
      try {
        const result = await fetchCheckpointInspection(sessionId, access, seat || undefined, checkpoint || undefined, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to read checkpoints");
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          if (live && !checkpoint) timer = setTimeout(read, 2000);
        }
      }
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, access, seat, checkpoint, refresh, live]);
  const changed = data ? stateChanges(data.previous_values, data.values) : [];
  const selectedId = data?.selected?.id;
  const messages = data?.values.messages;
  const content = <section className={styles.inspector} aria-label="LangGraph state inspector">
    <header><div><span className={styles.eyebrow}>REAL CHECKPOINTS · READ ONLY · HOST VIEW</span><h3>Inside LangGraph</h3><p>Inspect saved state, agent context and what changed between steps.</p></div>
      <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Close expanded inspector" : "Expand inspector"}</button>
      <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={busy}>Refresh</button>
    </header>
    <div className={styles.toolbar}>
      <Select ariaLabel="Graph thread" value={seat} onChange={value => { setSeat(value); setCheckpoint(""); setData(null); setRefresh(n => n + 1); }} options={[{ value: "", label: "Game orchestrator", sublabel: "Shared game state and interrupts" }, ...(data?.seats ?? []).map(s => ({ value: s.seat_id, label: s.name, sublabel: s.controller === "human" ? "Human · no AI memory thread" : "Independent agent memory" }))]} />
      <label><input type="checkbox" checked={live} onChange={event => { setLive(event.target.checked); setCheckpoint(""); }} /> Follow latest</label>
      <span role="status">{busy ? "Reading checkpoint…" : live ? "Refreshes every 2 seconds" : "Snapshot held for inspection"}</span>
    </div>
    <p className={styles.explainer}>{seat ? "Independent memory: each agent has its own checkpoint thread. Persona and briefing are inputs; messages are its stored conversation; commit_args is the action it submitted." : "State machine: nodes read the saved game state and write updates. ‘Next’ identifies pending work; an interrupt waits for a human before the graph can continue."}</p>
    {error && <p role="alert">{error} <button onClick={() => setRefresh(n => n + 1)}>Retry</button></p>}
    <div className={styles.workspace}>
      <nav className={styles.history} aria-label="Checkpoint history">
        <button className={!checkpoint ? styles.active : ""} onClick={() => { setCheckpoint(""); setRefresh(n => n + 1); }}>Latest checkpoint</button>
        <small>Most recent 30 · selecting history stops live updates</small>
        {data?.history.map(item => <button key={item.id} className={item.id === selectedId ? styles.active : ""} onClick={() => { setCheckpoint(item.id); setLive(false); }}>
          <strong>Step {item.step ?? "—"} · {item.writes.join(", ") || item.source || "checkpoint"}</strong>
          <span>{item.next.length ? `Next: ${item.next.join(", ")}` : "No pending nodes"}</span>
          <small>{item.created_at ? new Date(item.created_at).toLocaleTimeString() : item.id}</small>
        </button>)}
      </nav>
      <div className={styles.detail}>
        <div className={styles.tabs} aria-label="Inspector views">{["state", "changes", "context"].map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab === "state" ? "State tree" : tab === "changes" ? `Changes (${changed.length})` : "Agent context"}</button>)}</div>
        {data?.available ? <>
          <div className={styles.metadata}><code>{data.thread_id}</code><span>Checkpoint {selectedId}</span><span>Next: {data.selected?.next.join(" → ") || "none"}</span></div>
          {view === "state" && <><JsonTree label="values" value={data.values} /><JsonTree label="tasks / interrupts" value={data.tasks} /></>}
          {view === "changes" && <><p>Compared with this checkpoint’s parent, not the last browser refresh.</p>{changed.length ? changed.map(change => <article className={styles.change} key={change.path}><h4>{change.path}</h4><JsonTree label="Before" value={change.before} /><JsonTree label="After" value={change.after} /></article>) : <p>No stored value changes.</p>}</>}
          {view === "context" && (seat ? <><JsonTree label="Persona" value={data.values.persona ?? "No persona stored"} /><JsonTree label="Latest briefing" value={data.values.briefing ?? "No briefing stored"} /><JsonTree label="Stored messages" value={messages ?? []} /><JsonTree label="Committed action" value={{ tool: data.values.commit_tool, arguments: data.values.commit_args, result: data.values.result }} /></> : <p>Select an agent to inspect its persona, briefing, messages and committed action. The game orchestrator stores shared game state rather than an LLM conversation.</p>)}
        </> : <p className={styles.empty}>{busy ? "Loading saved graph state…" : "No checkpoint yet. Start the game and let this agent take a turn. Human seats do not have an AI conversation thread."}</p>}
      </div>
    </div>
    <footer>Saved checkpoints may lag a running node. Threads are sampled independently. Provider credentials and internal reasoning blocks are excluded; stored actions and messages are inspectable.</footer>
  </section>;
  return expanded ? createPortal(<dialog ref={dialog} className={styles.dialog} aria-label="Expanded LangGraph state inspector" onCancel={() => setExpanded(false)}>{content}</dialog>, document.body) : content;
}
