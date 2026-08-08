"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { beginGame, continueGame, pauseGame, stopGame, submitInput } from "@/lib/api";
import { useGameStream } from "@/lib/useGameStream";
import { PlayerCard } from "./PlayerCard";
import { Feed } from "./Feed";
import { Controls } from "./Controls";
import { GodViewToggle } from "./GodViewToggle";
import { DebugPanel } from "./DebugPanel";
import { GameSummary } from "./GameSummary";
import { MoonIcon, SunIcon, EyeIcon } from "./icons";

export function GameView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { game, active, connected, errorMessage, currentNode, mindNode, mindNodeCounts, metrics, activity } =
    useGameStream(sessionId);
  const [godView, setGodView] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [beginning, setBeginning] = useState(false);
  // The game-over overlay covers the board, so reading the technical
  // summary means dismissing it first rather than opening a second layer
  // on top of it.
  const [showSummary, setShowSummary] = useState(false);

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

  const humanPlayer = game.players.find((player) => player.controller === "human");
  const humanSeerKnowledge =
    humanPlayer?.role === "seer"
      ? (game.seer_knowledge[humanPlayer.seat_id] ?? {})
      : {};

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

  const handleBegin = async () => {
    setBeginning(true);
    try {
      await beginGame(sessionId);
    } catch (err) {
      console.error(err);
      setBeginning(false);
    }
  };

  const handlePause = () => pauseGame(sessionId).catch(console.error);
  const handleContinue = () => continueGame(sessionId).catch(console.error);

  const handleStop = async () => {
    if (!window.confirm("Stop this game and start over? This abandons the current game.")) return;
    setStopping(true);
    try {
      await stopGame(sessionId);
    } catch (err) {
      console.error(err);
    } finally {
      router.push("/");
    }
  };

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
            {/* "Night" would be a lie before the graph has run anything --
                assign_roles hasn't dealt roles and start_night hasn't set the
                phase yet. */}
            <span>{game.phase === "lobby" ? "Not started" : isNight ? "Night" : "Day"}</span>
          </div>
          <div className="badge">
            <EyeIcon />
            <span>Round {game.round}</span>
          </div>
          <GodViewToggle on={godView} onToggle={() => setGodView((v) => !v)} />
          {!game.winner && game.phase !== "lobby" && (
            <button
              className="btn btn-secondary"
              style={{ padding: "7px 14px", fontSize: 12.5 }}
              onClick={game.paused ? handleContinue : handlePause}
            >
              {game.paused ? "▶ Continue" : "⏸ Pause"}
            </button>
          )}
          <button
            className="btn btn-secondary"
            style={{ padding: "7px 14px", fontSize: 12.5 }}
            onClick={handleStop}
            disabled={stopping}
          >
            {stopping ? "Stopping..." : "⏹ New Game"}
          </button>
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
              knownRole={humanSeerKnowledge[p.name]}
            />
          ))}
        </div>
        {/* At lobby the feed is empty, and its fixed 500px would push Start
            below the fold on a shorter laptop screen -- which would be worse
            than the modal this replaced. Collapse it until there's something
            to show. */}
        <div className={`feed-wrap${game.phase === "lobby" ? " feed-wrap-lobby" : ""}`}>
          <Feed entries={game.log} godView={godView} active={activeAiTurn} />
          <div className="controls">
            {/* Start lives here rather than in a modal overlay. A centred
                dialog covers the board, so pressing Start meant looking at a
                dialog at the exact moment the first turns resolved -- and with
                mock seats those land instantly, so the opening moves were
                genuinely missed. Sitting in the controls panel, directly under
                the feed and where every other player action already happens,
                it starts the game with the board already in view. */}
            {game.phase === "lobby" ? (
              <>
                <div className="controls-hint">
                  Seats are configured and the event stream is already live. The graph hasn’t run
                  a single node yet — start it and you’ll see every step from the first one.
                </div>
                <button className="btn" onClick={handleBegin} disabled={beginning}>
                  {beginning ? "Starting..." : "▶ Start Game"}
                </button>
              </>
            ) : (
              <Controls
                awaiting={game.awaiting}
                paused={game.paused}
                onSubmit={handleSubmit}
                onContinue={handleContinue}
                submitting={submitting}
              />
            )}
          </div>
        </div>
      </div>

      {game.winner && !showSummary && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{game.winner === "villagers" ? "Villagers win" : "Werewolves win"}</h2>
            <p>
              {game.winner === "villagers"
                ? "Every werewolf has been rooted out. The village is safe — for now."
                : "The werewolves now equal or outnumber the villagers. The night has claimed the village."}
            </p>
            <div className="overlay-actions">
              <Link className="btn" href="/">
                Play again
              </Link>
              <button className="btn-ghost" type="button" onClick={() => setShowSummary(true)}>
                ⌗ Technical summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Only after a game ends: everything here is read back out of the
          checkpointer rather than streamed live, so there is nothing to show
          mid-game (see backend/app/game/timeline.py). */}
      {game.winner && (
        <section className="debug-panel">
          <div className="debug-panel-header">
            <h2 className="debug-panel-title">
              <span>⌗</span> Post-game technical summary
            </h2>
          </div>
          <div className="summary-body">
            <GameSummary sessionId={sessionId} />
          </div>
        </section>
      )}

      <DebugPanel
        currentNode={currentNode}
        mindNode={mindNode}
        mindNodeCounts={mindNodeCounts}
        metrics={metrics}
        activity={activity}
      />
    </div>
  );
}
