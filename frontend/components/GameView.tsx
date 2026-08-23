"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { beginGame, continueGame, fetchLineage, pauseGame, stopGame, submitInput } from "@/lib/api";
import type { GameAccessCredentials, GameBranch } from "@/lib/types";
import { useGameStream } from "@/lib/useGameStream";
import { PlayerCard } from "./PlayerCard";
import { Feed } from "./Feed";
import { Controls } from "./Controls";
import { GodViewToggle } from "./GodViewToggle";
import { DebugPanel } from "./DebugPanel";
import { GameSummary } from "./GameSummary";
import { MoonIcon, SunIcon, EyeIcon } from "./icons";
import type { CouncilCameraMode } from "./CouncilTable3D";
import { VoiceCouncil } from "./VoiceCouncil";

const CouncilTable3D = dynamic(
  () => import("./CouncilTable3D").then((module) => module.CouncilTable3D),
  {
    ssr: false,
    loading: () => <div className="council-3d-loading">Opening the council chamber…</div>,
  }
);

export function GameView({
  sessionId,
  initialAccess,
}: {
  sessionId: string;
  initialAccess: GameAccessCredentials | null;
}) {
  const router = useRouter();
  const [access] = useState<GameAccessCredentials | null>(() => {
    if (initialAccess) return initialAccess;
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(window.localStorage.getItem(`village-access:${sessionId}`) ?? "null");
    } catch {
      return null;
    }
  });
  const {
    game, active, connected, errorMessage, currentNode, mindNode, mindNodeCounts,
    metrics, activity, privateNotes, beliefEvents,
  } =
    useGameStream(sessionId, access ?? undefined);
  const canGodView = Boolean(access?.hostToken);
  const [godView, setGodView] = useState(canGodView);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [beginning, setBeginning] = useState(false);
  const [councilOpen, setCouncilOpen] = useState(true);
  const [councilCamera, setCouncilCamera] = useState<CouncilCameraMode>("cinematic");
  // The game-over overlay covers the board, so reading the technical
  // summary means dismissing it first rather than opening a second layer
  // on top of it.
  const [showSummary, setShowSummary] = useState(false);
  const [lineage, setLineage] = useState<GameBranch | null>(null);
  const [speakingSeatId, setSpeakingSeatId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!showSummary) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSummary(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showSummary]);

  useEffect(() => {
    let cancelled = false;
    fetchLineage(sessionId, access ?? undefined).then((value) => {
      if (!cancelled) setLineage(value);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, access]);

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

  const humanPlayer = game.players.find((player) => player.seat_id === access?.seatId);
  const humanSeerKnowledge =
    humanPlayer?.role === "seer"
      ? (game.seer_knowledge[humanPlayer.seat_id] ?? {})
      : {};
  const humanCanSeeWerewolfCouncil = Boolean(
    humanPlayer?.role === "werewolf" && humanPlayer.alive
  );
  const councilPlayers = game.players.map((player) => ({
    seatId: player.seat_id,
    name: player.name,
    alive: player.alive,
    you: player.seat_id === access?.seatId,
    role:
      player.seat_id === access?.seatId || !player.alive || godView
        ? (player.role ?? null)
        : (humanSeerKnowledge[player.name] ?? null),
  }));
  const latestSceneEvent = [...game.log]
    .reverse()
    .find((entry) => entry.type === "statement" || entry.type === "vote" || entry.type === "death") ?? null;

  const handleSubmit = async (value: Record<string, unknown>) => {
    if (!game.awaiting) return false;
    setSubmitting(true);
    try {
      await submitInput(sessionId, {
        seat_id: game.awaiting.seat_id,
        kind: game.awaiting.kind,
        value,
      }, access ?? undefined);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleBegin = async () => {
    setBeginning(true);
    try {
      await beginGame(sessionId, access ?? undefined);
    } catch (err) {
      console.error(err);
      setBeginning(false);
    }
  };

  const handlePause = () => pauseGame(sessionId, access ?? undefined).catch(console.error);
  const handleContinue = () => continueGame(sessionId, access ?? undefined).catch(console.error);

  const handleStop = async () => {
    if (!window.confirm("Stop this game and start over? This abandons the current game.")) return;
    setStopping(true);
    try {
      await stopGame(sessionId, access ?? undefined);
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
          {canGodView ? <GodViewToggle on={godView} onToggle={() => setGodView((v) => !v)} /> : null}
          {canGodView && !game.winner && game.phase !== "lobby" && (
            <button
              className="btn btn-secondary"
              style={{ padding: "7px 14px", fontSize: 12.5 }}
              onClick={game.paused ? handleContinue : handlePause}
            >
              {game.paused ? "▶ Continue" : "⏸ Pause"}
            </button>
          )}
          {canGodView ? <button
            className="btn btn-secondary"
            style={{ padding: "7px 14px", fontSize: 12.5 }}
            onClick={handleStop}
            disabled={stopping}
          >
            {stopping ? "Stopping..." : "⏹ New Game"}
          </button> : <Link className="btn btn-secondary" href="/">Leave game</Link>}
        </div>
      </header>

      {lineage ? (
        <div className="branch-lineage-banner">
          <span>COUNTERFACTUAL BRANCH</span>
          <p>This world forked at event #{lineage.branch_log_seq}, replacing a {lineage.replaced_kind} decision. The original timeline remains unchanged.</p>
          <Link href={`/game/${lineage.parent_game_id}`}>Open original ↗</Link>
        </div>
      ) : null}

      <VoiceCouncil
        sessionId={sessionId}
        access={access ?? undefined}
        entries={game.log}
        players={game.players}
        onSpeaking={setSpeakingSeatId}
      />

      <section className={`council-3d-shell${councilOpen ? "" : " is-collapsed"}`} aria-label="Live cinematic village">
        <div className="council-3d-caption">
          <div>
            <span>THE LIVING VILLAGE</span>
            <small>
              {active?.name
                ? `${active.name} holds the floor · camera following`
                : game.phase === "lobby"
                  ? "The cast waits for nightfall"
                  : latestSceneEvent?.type === "death"
                    ? "The village remembers its fallen"
                    : "The village is listening"}
            </small>
          </div>
          <div className="council-view-controls">
            {councilOpen && (
              <div className="council-camera-switch" aria-label="Village camera mode">
                <button
                  type="button"
                  className={councilCamera === "cinematic" ? "is-active" : ""}
                  aria-pressed={councilCamera === "cinematic"}
                  onClick={() => setCouncilCamera("cinematic")}
                >
                  ◉ Cinema
                </button>
                <button
                  type="button"
                  className={councilCamera === "map" ? "is-active" : ""}
                  aria-pressed={councilCamera === "map"}
                  onClick={() => setCouncilCamera("map")}
                >
                  ◇ Map
                </button>
              </div>
            )}
            <button
              className="council-collapse-btn"
              type="button"
              aria-expanded={councilOpen}
              aria-controls="council-3d-stage"
              onClick={() => setCouncilOpen((open) => !open)}
            >
              <span aria-hidden="true">{councilOpen ? "▴" : "▾"}</span>
              {councilOpen ? "Collapse" : "Open village"}
            </button>
          </div>
        </div>
        <div className="council-3d-stage" id="council-3d-stage" aria-hidden={!councilOpen}>
          {councilOpen && (
            <CouncilTable3D
              players={councilPlayers}
              activeSeatId={speakingSeatId ?? active?.seat_id ?? null}
              phase={game.phase}
              event={latestSceneEvent ? {
                type: latestSceneEvent.type,
                seatId: latestSceneEvent.seat_id ?? null,
                target: latestSceneEvent.target ?? null,
              } : null}
              cameraMode={councilCamera}
            />
          )}
        </div>
      </section>

      <div className="board">
        <div className="players">
          {game.players.map((p) => (
            <PlayerCard
              key={p.seat_id}
              player={p}
              active={active?.seat_id === p.seat_id}
              godView={godView}
              knownRole={humanSeerKnowledge[p.name]}
              viewerSeatId={access?.seatId}
            />
          ))}
        </div>
        {/* At lobby the feed is empty, and its fixed 500px would push Start
            below the fold on a shorter laptop screen -- which would be worse
            than the modal this replaced. Collapse it until there's something
            to show. */}
        <div className={`feed-wrap${game.phase === "lobby" ? " feed-wrap-lobby" : ""}`}>
          <Feed
            entries={game.log}
            godView={godView}
            canSeeWerewolfCouncil={humanCanSeeWerewolfCouncil}
            active={activeAiTurn}
          />
          <div className="controls">
            {/* Start lives here rather than in a modal overlay. A centred
                dialog covers the board, so pressing Start meant looking at a
                dialog at the exact moment the first turns resolved -- and with
                mock seats those land instantly, so the opening moves were
                genuinely missed. Sitting in the controls panel, directly under
                the feed and where every other player action already happens,
                it starts the game with the board already in view. */}
            {game.phase === "lobby" && canGodView ? (
              <>
                <div className="controls-hint">
                  Seats are configured and the event stream is already live. The graph hasn’t run
                  a single node yet — start it and you’ll see every step from the first one.
                </div>
                <button className="btn" onClick={handleBegin} disabled={beginning}>
                  {beginning ? "Starting..." : "▶ Start Game"}
                </button>
              </>
            ) : game.phase === "lobby" ? (
              <div className="controls-hint">Waiting for the room host to begin the game…</div>
            ) : (
              <Controls
                awaiting={game.awaiting}
                paused={game.paused}
                onSubmit={handleSubmit}
                onContinue={handleContinue}
                submitting={submitting}
                promptKey={
                  game.awaiting
                    ? game.awaiting.turn_id ?? `${game.round}:${game.phase}:${game.awaiting.seat_id}:${game.awaiting.kind}`
                    : null
                }
              />
            )}
          </div>
        </div>
      </div>

      {game.winner && !showSummary && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{game.winner === "villagers" ? "Villagers win" : game.winner === "jester" ? "The Jester wins" : "Werewolves win"}</h2>
            <p>
              {game.winner === "villagers"
                ? "Every werewolf has been rooted out. The village is safe — for now."
                : game.winner === "jester"
                  ? "The village cast out exactly the player who wanted the gallows. The final laugh belongs to the Jester."
                  : "The werewolves now equal or outnumber the villagers. The night has claimed the village."}
            </p>
            <div className="overlay-actions">
              <Link className="btn" href="/">
                Play again
              </Link>
              <button className="btn-ghost" type="button" onClick={() => setShowSummary(true)}>
                ◈ Learning debrief
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The report used to render inline below the entire game and made an
          already information-dense page several screens longer. Keep it in a
          focused, internally scrolling workspace instead. */}
      {game.winner && showSummary ? (
        <div
          className="summary-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSummary(false);
          }}
        >
          <section
            className="summary-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-game-summary-title"
          >
            <header className="summary-modal-header">
              <div>
                <span>POST-GAME ANALYSIS</span>
                <h2 id="post-game-summary-title">Learning debrief &amp; technical trace</h2>
              </div>
              <button
                className="summary-modal-close"
                type="button"
                autoFocus
                aria-label="Close post-game summary"
                onClick={() => setShowSummary(false)}
              >
                ×
              </button>
            </header>
            <div className="summary-modal-scroll">
              <GameSummary sessionId={sessionId} access={access ?? undefined} />
            </div>
          </section>
        </div>
      ) : null}

          <DebugPanel
            sessionId={sessionId}
            access={access ?? undefined}
        godView={godView}
        currentNode={currentNode}
        mindNode={mindNode}
        mindNodeCounts={mindNodeCounts}
        metrics={metrics}
        activity={activity}
        privateNotes={privateNotes}
        beliefEvents={beliefEvents}
        players={game.players}
      />
    </div>
  );
}
