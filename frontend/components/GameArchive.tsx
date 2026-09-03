"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchGameArchive, fetchGameHistory } from "@/lib/api";
import type { GameArchive as GameArchiveDetail, GameHistoryRecord } from "@/lib/types";

const ARCHIVE_KEY_STORAGE = "village-game-archive-key";

function formatDate(value: string | null): string {
  if (!value) return "Not started";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Unavailable";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function statusLabel(game: GameHistoryRecord): string {
  if (game.status === "finished") return `${game.winner ?? "Unknown"} win`;
  if (game.status === "stopped") return "Stopped";
  if (game.status === "in_progress") return "In progress";
  return "Lobby";
}

type ArchiveWeek = { label: string; games: GameHistoryRecord[] };
type ArchiveMonth = { label: string; weeks: ArchiveWeek[] };

function groupGames(games: GameHistoryRecord[]): ArchiveMonth[] {
  const months = new Map<string, { label: string; weeks: Map<string, ArchiveWeek> }>();
  for (const game of games) {
    const timestamp = game.started_at ?? game.created_at;
    const date = timestamp ? new Date(timestamp) : new Date(Number.NaN);
    const valid = !Number.isNaN(date.valueOf());
    const monthKey = valid ? `${date.getFullYear()}-${date.getMonth()}` : "unknown";
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekKey = valid ? monday.toISOString().slice(0, 10) : "unknown";
    let month = months.get(monthKey);
    if (!month) {
      month = {
        label: valid ? date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Older sessions",
        weeks: new Map(),
      };
      months.set(monthKey, month);
    }
    let week = month.weeks.get(weekKey);
    if (!week) {
      week = {
        label: valid ? `Week of ${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Date unavailable",
        games: [],
      };
      month.weeks.set(weekKey, week);
    }
    week.games.push(game);
  }
  return [...months.values()].map((month) => ({ ...month, weeks: [...month.weeks.values()] }));
}

export function GameArchive() {
  const [key, setKey] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.sessionStorage.getItem(ARCHIVE_KEY_STORAGE) ?? ""; } catch { return ""; }
  });
  const [games, setGames] = useState<GameHistoryRecord[]>([]);
  const [selected, setSelected] = useState<GameArchiveDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGameHistory(key);
      setGames(result);
      setSelected(null);
      try { window.sessionStorage.setItem(ARCHIVE_KEY_STORAGE, key); } catch {}
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the game archive.");
    } finally {
      setLoading(false);
    }
  }

  async function selectGame(sessionId: string) {
    setLoading(true);
    setError(null);
    try {
      setSelected(await fetchGameArchive(sessionId, key));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load that game.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app game-archive-page">
      <header className="game-archive-hero">
        <Link href="/setup">← Game setup</Link>
        <span>PRIVATE OPERATOR VIEW</span>
        <h1>Every village, remembered.</h1>
        <p>Review sessions hosted by this deployment: human attendance, browser context, country codes, timing, duration, outcomes, and a public transcript. Raw IP addresses are never stored.</p>
      </header>

      <section className="game-archive-unlock" aria-labelledby="archive-key-title">
        <div><b id="archive-key-title">Unlock the archive</b><small>Enter the deployment’s GAME_HISTORY_ACCESS_KEY. It is kept only for this browser session.</small></div>
        <input value={key} type="password" autoComplete="off" placeholder="Game archive key" onChange={(event) => setKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && key) void load(); }} />
        <button className="btn" type="button" disabled={!key || loading} onClick={() => void load()}>{loading ? "Loading…" : "Open archive"}</button>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {games.length > 0 ? <section className="game-archive-list" aria-label="Game sessions">
        {groupGames(games).map((month) => <section className="game-archive-month" key={month.label}>
          <h2>{month.label}</h2>
          {month.weeks.map((week) => <section className="game-archive-week" key={week.label}>
            <h3>{week.label}</h3>
            {week.games.map((game) => <button className="game-archive-row" type="button" key={game.session_id} onClick={() => void selectGame(game.session_id)}>
              <span className={`game-archive-status is-${game.status}`}>{statusLabel(game)}</span>
              <div><strong>{formatDate(game.started_at ?? game.created_at)}</strong><small>{game.session_id}</small></div>
              <div><b>{formatDuration(game.duration_seconds)}</b><small>{game.duration_seconds === null ? "predates archive" : game.started_at ? "game duration" : "lobby age"}</small></div>
              <div className="game-archive-people"><b>{game.participants.length ? game.participants.map((participant) => participant.name).join(", ") : "No human seat"}</b><small>{game.participants.length ? game.participants.map((participant) => participant.joined ? participant.country_code ?? "Unknown country" : "Not joined").join(" · ") : "Autonomous"}</small></div>
            </button>)}
          </section>)}
        </section>)}
      </section> : key && !loading && !error ? <p className="metrics-empty">No games have been created on this deployment yet.</p> : null}

      {selected ? <div className="game-archive-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section className="game-archive-detail" role="dialog" aria-modal="true" aria-labelledby="archive-detail-title">
          <header><div><span>SESSION {selected.session_id}</span><h2 id="archive-detail-title">{statusLabel(selected)} · {formatDuration(selected.duration_seconds)}</h2><p className="game-archive-timing">Started {formatDate(selected.started_at)} · {selected.finished_at ? `Finished ${formatDate(selected.finished_at)}` : "Still open"}</p></div><button type="button" onClick={() => setSelected(null)}>Close</button></header>
          <div className="game-archive-detail-grid">
            <section><h3>Human attendance</h3>{selected.participants.length ? selected.participants.map((participant) => <p key={participant.seat_id}><b>{participant.name}</b><span>{participant.joined ? `${participant.country_code ?? "Unknown country"} · joined ${formatDate(participant.joined_at)} · last seen ${formatDate(participant.last_seen_at)} · ${participant.actions_taken} actions` : "Invite not claimed"}</span></p>) : <p>No human-controlled seats.</p>}</section>
            <section><h3>Table configuration</h3>{selected.seats.map((seat) => <p key={seat.seat_id}><b>{seat.name}</b><span>{seat.controller === "human" ? "Human" : `${seat.provider ?? "AI"} · ${seat.model_name ?? "unknown model"}`}</span></p>)}</section>
            <section><h3>Browser context</h3>{selected.participants.filter((participant) => participant.joined).length ? selected.participants.filter((participant) => participant.joined).map((participant) => <p key={participant.seat_id}><b>{participant.name}</b><span>{[participant.browser_name, participant.os_name, participant.device_class, participant.viewport_size].filter(Boolean).join(" · ") || "Not available"}</span><span>{[participant.language, participant.timezone, participant.connection_type, participant.save_data ? "data saver" : null].filter(Boolean).join(" · ") || "No browser context"}</span></p>) : <p>No participant browser context yet.</p>}</section>
          </div>
          <section className="game-archive-transcript"><h3>Public transcript</h3>{selected.public_log.length ? selected.public_log.map((entry) => <article key={entry.seq}><span>R{entry.round} · {entry.phase}</span><p>{entry.text ?? "(No public text)"}</p></article>) : <p>No public events were recorded.</p>}</section>
        </section>
      </div> : null}
    </main>
  );
}
