"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { continueGame, pauseGame, submitInput } from "@/lib/api";
import { useGameStream } from "@/lib/useGameStream";
import { PlayerCard } from "./PlayerCard";
import { Feed } from "./Feed";
import { Controls } from "./Controls";
import { GodViewToggle } from "./GodViewToggle";
import { DebugPanel } from "./DebugPanel";
import { MoonIcon, SunIcon, EyeIcon } from "./icons";

export function GameView({ sessionId }: { sessionId: string }) {
  const { game, active, connected, errorMessage, currentNode, metrics } = useGameStream(sessionId);
  const [godView, setGodView] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isNight = !game || game.phase === "night" || game.phase === "lobby";
  // The "X is thinking" feed indicator only makes sense for an AI seat --
  // a human's own turn already shows a live prompt in the controls panel.
  const activeAiTurn =
    active && game?.players.find((p) => p.seat_id === active.seat_id)?.controller === "ai"
      ? active
      : null;

  useEffect(() => {
    document.body.classList.toggle("phase-day", !isNight);
    return () => document.body.classList.remove("phase-day");
  }, [isNight]);

  if (errorMessage) {
    return (
      <div className="app">
        <p className="error-text">Something went wrong: {errorMessage}</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="app">
        <p className="subtitle">{connected ? "Loading game..." : "Connecting..."}</p>
      </div>
    );
  }

  const handleSubmit = async (value: Record<string, unknown>) => {
    if (!game.awaiting) return;
    setSubmitting(true);
    try {
      await submitInput(sessionId, {
        seat_id: game.awaiting.seat_id,
        kind: game.awaiting.kind,
        value,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = () => pauseGame(sessionId).catch(console.error);
  const handleContinue = () => continueGame(sessionId).catch(console.error);

  return (
    <div className="app">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="village-title">Village of Shadows</h1>
          <div className="subtitle">A multi-agent game of Werewolf, played out in real time</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="badge">
            {isNight ? <MoonIcon /> : <SunIcon />}
            <span>{isNight ? "Night" : "Day"}</span>
          </div>
          <div className="badge">
            <EyeIcon />
            <span>Round {game.round}</span>
          </div>
          <GodViewToggle on={godView} onToggle={() => setGodView((v) => !v)} />
          {!game.winner && (
            <button
              className="btn btn-secondary"
              style={{ padding: "7px 14px", fontSize: 12.5 }}
              onClick={game.paused ? handleContinue : handlePause}
            >
              {game.paused ? "▶ Continue" : "⏸ Pause"}
            </button>
          )}
        </div>
      </header>

      <div className="board">
        <div className="players">
          {game.players.map((p) => (
            <PlayerCard
              key={p.seat_id}
              player={p}
              active={active?.seat_id === p.seat_id}
              godView={godView}
            />
          ))}
        </div>
        <div className="feed-wrap">
          <Feed entries={game.log} godView={godView} active={activeAiTurn} />
          <div className="controls">
            <Controls
              awaiting={game.awaiting}
              paused={game.paused}
              onSubmit={handleSubmit}
              onContinue={handleContinue}
              submitting={submitting}
            />
          </div>
        </div>
      </div>

      {game.winner && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{game.winner === "villagers" ? "Villagers win" : "Werewolves win"}</h2>
            <p>
              {game.winner === "villagers"
                ? "Every werewolf has been rooted out. The village is safe — for now."
                : "The werewolves now equal or outnumber the villagers. The night has claimed the village."}
            </p>
            <Link className="btn" href="/">
              Play again
            </Link>
          </div>
        </div>
      )}

      <DebugPanel currentNode={currentNode} metrics={metrics} />
    </div>
  );
}
