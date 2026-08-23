"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchReplay } from "@/lib/api";
import type { ResolvedReplay } from "@/lib/types";

export function ReplayViewer({ shareId, secret }: { shareId: string; secret?: string }) {
  const [replay, setReplay] = useState<ResolvedReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReplay(shareId, secret)
      .then((value) => { if (!cancelled) setReplay(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Replay unavailable"); });
    return () => { cancelled = true; };
  }, [shareId, secret]);

  useEffect(() => {
    if (!playing || !replay || cursor >= replay.snapshot.events.length) return;
    const timer = window.setTimeout(() => {
      const next = cursor + 1;
      setCursor(next);
      if (next >= replay.snapshot.events.length) setPlaying(false);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [playing, replay, cursor]);

  const events = useMemo(() => replay?.snapshot.events.slice(0, cursor) ?? [], [replay, cursor]);
  const last = events.at(-1);

  if (error) return <main className="replay-page replay-error"><span>THE ARCHIVE IS SILENT</span><h1>Replay unavailable</h1><p>{error}</p></main>;
  if (!replay) return <main className="replay-page replay-loading"><span className="summary-loading-mark">◈</span><h1>Opening the sealed chronicle…</h1></main>;

  const snapshot = replay.snapshot;
  return (
    <main className="replay-page">
      <header className="replay-hero">
        <div>
          <span>{replay.scope === "god" ? "GOD MODE CHRONICLE" : "PUBLIC CHRONICLE"}</span>
          <h1>Village of Shadows</h1>
          <p>An immutable, read-only replay of a multi-agent world.</p>
        </div>
        <div className={`replay-verdict is-${snapshot.winner ?? "unknown"}`}>
          <small>Final outcome</small><strong>{snapshot.winner ?? "unfinished"}</strong><span>{snapshot.rounds} rounds</span>
        </div>
      </header>

      <section className="replay-council" aria-label="Council seats">
        {snapshot.players.map((player) => (
          <article key={player.seat_id} className={`${player.alive ? "" : "is-dead"} ${last?.seat_id === player.seat_id ? "is-speaking" : ""}`}>
            <span>{player.name.slice(0, 1)}</span>
            <strong>{player.name}</strong>
            <small>{replay.scope === "god" ? player.role : player.personality}</small>
          </article>
        ))}
      </section>

      <section className="replay-player">
        <div className="replay-controls">
          <button type="button" onClick={() => {
            if (!playing && cursor >= snapshot.events.length) setCursor(0);
            setPlaying((value) => !value);
          }}>{playing ? "Pause" : cursor ? "Continue" : "Play replay"}</button>
          <button type="button" onClick={() => { setPlaying(false); setCursor(0); }}>Restart</button>
          <span>{cursor} / {snapshot.events.length} events</span>
        </div>
        <input
          aria-label="Replay position"
          type="range"
          min="0"
          max={snapshot.events.length}
          value={cursor}
          onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)); }}
        />
        <div className="replay-transcript">
          {events.length ? events.slice(-12).map((entry) => (
            <article key={entry.seq} className={`is-${entry.type}`}>
              <span>#{entry.seq} · Round {entry.round} · {entry.phase}</span>
              <strong>{entry.name ?? entry.type}</strong>
              <p>{entry.text ?? entry.thought ?? (entry.target ? `Target: ${entry.target}` : "An action changed the world.")}</p>
            </article>
          )) : <p>Press play to enter the chamber.</p>}
        </div>
      </section>

      <section className="replay-evidence">
        <article><small>Graph steps</small><strong>{snapshot.graph.steps.length}</strong></article>
        <article><small>Model decisions</small><strong>{snapshot.metrics.length}</strong></article>
        <article><small>Recorded events</small><strong>{snapshot.events.length}</strong></article>
        <article><small>Scope</small><strong>{snapshot.scope}</strong></article>
      </section>

      <footer><Link href="/">Enter a new village</Link><span>Snapshot sealed {new Date(replay.created_at).toLocaleString()}</span></footer>
    </main>
  );
}
