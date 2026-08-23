"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createTournament, fetchTournament } from "@/lib/api";
import { DEFAULT_NAMES, DEFAULT_PERSONALITIES, PROVIDER_MODEL_SUGGESTIONS, PROVIDER_OPTIONS } from "@/lib/seatDefaults";
import type { AgentConfig, Provider, TournamentReport } from "@/lib/types";
import { Select } from "@/components/Select";

const STARTER_LINEUP: AgentConfig[] = DEFAULT_NAMES.map((name, index) => ({
  seat_id: `seat_${index}`,
  display_name: name,
  personality: DEFAULT_PERSONALITIES[index],
  controller: "ai",
  provider: "mock",
  model_name: index % 2 ? "mock-deliberate" : "mock-cautious",
  endpoint: null,
}));

export function TournamentLab() {
  const [lineup, setLineup] = useState(STARTER_LINEUP);
  const [gameCount, setGameCount] = useState(7);
  const [concurrency, setConcurrency] = useState(2);
  const [tokenBudget, setTokenBudget] = useState(2_000_000);
  const [spendCap, setSpendCap] = useState(0);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [report, setReport] = useState<TournamentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = report?.status === "queued" || report?.status === "running" || (tournamentId !== null && report === null);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const value = await fetchTournament(tournamentId);
        if (!cancelled) setReport(value);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load tournament");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tournamentId]);

  const start = async () => {
    setError(null);
    setReport(null);
    try {
      const value = await createTournament({
        lineup,
        game_count: gameCount,
        concurrency,
        max_total_tokens: tokenBudget,
        max_estimated_cost_usd: spendCap,
      });
      setTournamentId(value.tournament_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start tournament");
    }
  };

  return (
    <main className="app tournament-page">
      <header className="tournament-hero">
        <div><Link href="/">← Village gates</Link><span>MODEL TOURNAMENT MODE</span><h1>Seven seats.<br />Repeated worlds.</h1></div>
        <p>Rotate secret roles, run autonomous games, and compare reliability, survival, accusations, deception, latency, and token use.</p>
      </header>

      <section className="tournament-config">
        <div className="tournament-settings">
          <label>Games<input type="number" min={1} max={50} value={gameCount} onChange={(event) => setGameCount(Number(event.target.value))} /></label>
          <label>Concurrency<input type="number" min={1} max={4} value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} /></label>
          <label>Token ceiling<input type="number" min={1000} max={50000000} value={tokenBudget} onChange={(event) => setTokenBudget(Number(event.target.value))} /></label>
          <label>Spend cap USD<input type="number" min={0} max={10000} step={0.25} value={spendCap} onChange={(event) => setSpendCap(Number(event.target.value))} /></label>
          <div><span>ROLE BALANCE</span><strong>Rotates every game</strong></div>
          <div><span>READINESS GATE</span><strong>Every model calls a test tool first</strong></div>
        </div>
        <div className="tournament-lineup">
          {lineup.map((seat, index) => (
            <article key={seat.seat_id}>
              <span>{String(index + 1).padStart(2, "0")}</span><strong>{seat.display_name}</strong>
              <Select
                ariaLabel={`${seat.display_name} provider`}
                value={seat.provider ?? "mock"}
                options={PROVIDER_OPTIONS}
                onChange={(value) => {
                  const provider = value as Provider;
                  const model = PROVIDER_MODEL_SUGGESTIONS[provider][0]?.value ?? "";
                  setLineup((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, provider, model_name: model } : item));
                }}
              />
              <input
                aria-label={`${seat.display_name} model`}
                value={seat.model_name ?? ""}
                onChange={(event) => setLineup((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, model_name: event.target.value } : item))}
              />
              <small>{seat.provider} · {seat.personality}</small>
            </article>
          ))}
        </div>
        <button className="btn tournament-launch" type="button" onClick={start} disabled={running}>
          {running ? "Tournament running…" : "Run balanced tournament"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {report ? (
        <section className="tournament-results">
          <header><div><span>{report.status.toUpperCase()}</span><h2>{report.games_completed} / {report.games_requested} worlds complete</h2></div><p>{report.totals.tokens.toLocaleString()} tokens · ${report.totals.estimated_cost_usd.toFixed(4)} estimated</p></header>
          {report.stop_reason ? <p className="error-text">{report.stop_reason}</p> : null}
          <div className="summary-table-wrap">
            <table className="metrics-table">
              <thead><tr><th>Model</th><th className="num">Games</th><th className="num">Win %</th><th className="num">Wolf win %</th><th className="num">Correct</th><th className="num">False</th><th className="num">Survival</th><th className="num">Latency</th></tr></thead>
              <tbody>{report.summary.map((row) => (
                <tr key={`${row.provider}:${row.model_name}`}><td>{row.model_name}<small className="learning-model">{row.provider}</small></td><td className="num">{row.games}</td><td className="num">{Math.round(row.win_rate * 100)}%</td><td className="num">{Math.round(row.deception_success * 100)}%</td><td className="num">{row.correct_votes}</td><td className="num">{row.false_votes}</td><td className="num">{row.average_survival}</td><td className="num">{row.average_latency_ms}ms</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
