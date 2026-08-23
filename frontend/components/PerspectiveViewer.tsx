"use client";

import { useEffect, useState } from "react";
import { fetchPerspective } from "@/lib/api";
import type { GameAccessCredentials, PerspectiveSnapshot, Player } from "@/lib/types";
import { Select } from "@/components/Select";

export function PerspectiveViewer({
  sessionId,
  players,
  access,
}: {
  sessionId: string;
  players: Player[];
  access?: GameAccessCredentials;
}) {
  const [seatId, setSeatId] = useState(players[0]?.seat_id ?? "");
  const [throughSeq, setThroughSeq] = useState<number | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<PerspectiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seatId) return;
    let cancelled = false;
    fetchPerspective(sessionId, seatId, throughSeq, access)
      .then((value) => {
        if (cancelled) return;
        setSnapshot(value);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not reconstruct perspective");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, seatId, throughSeq, access]);

  const notes = snapshot?.private_notes ?? [];
  const beliefs = snapshot?.beliefs ?? [];
  const history = snapshot?.conversation_history ?? [];

  return (
    <section className="perspective-panel">
      <div className="private-notes-heading">
        <div>
          <p className="debug-section-title">God Mode · agent perspective viewer</p>
          <p className="private-notes-explainer">
            A time-bounded reconstruction. Moving backwards removes future public events, discoveries, notes, and beliefs.
          </p>
        </div>
        {snapshot ? <span className="private-notes-count">event #{snapshot.through_seq}</span> : null}
      </div>

      <div className="perspective-controls">
        <label>
          Seat
          <Select
            value={seatId}
            options={players.map((player) => ({ value: player.seat_id, label: player.name }))}
            onChange={(value) => {
              setSeatId(value);
              setThroughSeq(undefined);
            }}
            ariaLabel="Perspective seat"
          />
        </label>
        <label>
          Moment
          <Select
            value={throughSeq === undefined ? "latest" : String(throughSeq)}
            onChange={(value) => setThroughSeq(value === "latest" ? undefined : Number(value))}
            options={[
              { value: "latest", label: "Latest permitted moment" },
              ...(snapshot?.moments ?? []).map((moment) => ({
                value: String(moment.seq),
                label: `#${moment.seq} · R${moment.round} ${moment.phase}`,
                sublabel: moment.label.slice(0, 52),
              })),
            ]}
            ariaLabel="Perspective moment"
          />
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {snapshot ? (
        <>
          <div className="perspective-identity">
            <span>{snapshot.name}</span>
            <strong>{snapshot.role ?? "role not dealt"}</strong>
            <small>Round {snapshot.round} · {snapshot.phase} · {snapshot.alive ? "alive" : "eliminated"}</small>
          </div>
          <div className="perspective-grid">
            <article>
              <span className="perspective-kicker">PRIVATE KNOWLEDGE</span>
              <pre>{JSON.stringify(snapshot.private_knowledge, null, 2)}</pre>
            </article>
            <article>
              <span className="perspective-kicker">LEGAL ACTION SPACE</span>
              <p>{snapshot.available_tools.map((tool) => <code key={tool}>{tool}</code>)}</p>
              <small>Targets: {snapshot.legal_targets.join(", ") || "none"}</small>
            </article>
            <article>
              <span className="perspective-kicker">ACTIVE PRIVATE STATE</span>
              <p>{notes.length} notes · {beliefs.length} relationship beliefs</p>
              <small>{notes.map((note) => note.content).join(" · ") || "No private notes yet."}</small>
            </article>
          </div>
          <details className="perspective-briefing" open>
            <summary>Prompt / briefing used by this seat</summary>
            <p>{snapshot.current_briefing ?? "This seat had not received an agent briefing at this moment."}</p>
          </details>
          <details className="perspective-briefing">
            <summary>Persistent conversation history · {history.length} messages</summary>
            <ol className="perspective-history">
              {history.map((message, index) => (
                <li key={`${message.round}-${message.phase}-${index}`} className={`is-${message.role}`}>
                  <span>{message.role} · R{message.round} {message.phase}</span>
                  <p>{message.content}</p>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <p className="metrics-empty">Reconstructing this seat&apos;s information boundary…</p>
      )}
    </section>
  );
}
