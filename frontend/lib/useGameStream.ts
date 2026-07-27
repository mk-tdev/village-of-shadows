"use client";

import { useEffect, useRef, useState } from "react";
import { streamUrl } from "./api";
import type { AwaitingInput, DecisionEvent, GameState, LogEntry, SeatMetrics, TurnEvent } from "./types";

export interface GameStreamState {
  game: GameState | null;
  active: TurnEvent | null;
  connected: boolean;
  errorMessage: string | null;
  currentNode: string | null;
  metrics: Record<string, SeatMetrics>;
}

/** Subscribes to /games/{id}/stream and reduces incoming SSE events into a
 * client-side GameState, mirroring the shape the werewolf_game.html
 * prototype rendered directly off of. See plan §9 / §5 -- SSE replaces the
 * WebSocket channel there, human input still goes over its own POST.
 *
 * Also tracks two things purely for the debug panel: which LangGraph node
 * is currently executing ("node" events) and per-seat token/latency
 * metrics accumulated from "decision" events -- see routers/graph.py and
 * agent_turn.py on the backend for where these originate. */
export function useGameStream(sessionId: string): GameStreamState {
  const [game, setGame] = useState<GameState | null>(null);
  const [active, setActive] = useState<TurnEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, SeatMetrics>>({});
  const gameRef = useRef<GameState | null>(null);

  useEffect(() => {
    const source = new EventSource(streamUrl(sessionId));

    source.addEventListener("open", () => setConnected(true));

    source.addEventListener("state", (e) => {
      const data: GameState = JSON.parse((e as MessageEvent).data);
      gameRef.current = data;
      setGame(data);
    });

    source.addEventListener("log", (e) => {
      const entry: LogEntry = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;

      // The initial "state" snapshot and the backlog of already-queued
      // "log" events can race -- a fast (e.g. mock-provider) game may
      // finish several steps before the browser's EventSource even opens,
      // so those entries arrive both embedded in the snapshot *and* as
      // queued events. Dedupe on seq rather than trying to suppress one
      // side, since a genuine reconnect-after-refresh needs the snapshot's
      // log and a fresh connection needs the queued backlog.
      if (current.log.some((existing) => existing.seq === entry.seq)) return;

      let players = current.players;
      if (entry.type === "death" && entry.seat_id) {
        players = players.map((p) =>
          p.seat_id === entry.seat_id ? { ...p, alive: false } : p
        );
      }
      const next: GameState = { ...current, players, log: [...current.log, entry] };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("turn", (e) => {
      const data: TurnEvent = JSON.parse((e as MessageEvent).data);
      setActive(data.seat_id ? data : null);
    });

    source.addEventListener("node", (e) => {
      const data: { node: string } = JSON.parse((e as MessageEvent).data);
      setCurrentNode(data.node);
    });

    source.addEventListener("decision", (e) => {
      const data: DecisionEvent = JSON.parse((e as MessageEvent).data);
      setMetrics((prev) => {
        const existing = prev[data.seat_id];
        const merged: SeatMetrics = {
          seat_id: data.seat_id,
          name: data.name,
          provider: data.provider,
          model_name: data.model_name,
          calls: (existing?.calls ?? 0) + 1,
          input_tokens: (existing?.input_tokens ?? 0) + (data.input_tokens ?? 0),
          output_tokens: (existing?.output_tokens ?? 0) + (data.output_tokens ?? 0),
          last_latency_ms: data.latency_ms,
          estimated: data.estimated,
        };
        return { ...prev, [data.seat_id]: merged };
      });
    });

    source.addEventListener("awaiting_input", (e) => {
      const data: AwaitingInput = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;
      const next = { ...current, awaiting: data };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("paused", () => {
      const current = gameRef.current;
      if (!current) return;
      const next = { ...current, paused: true };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("resumed", () => {
      const current = gameRef.current;
      if (!current) return;
      const next = { ...current, paused: false };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("game_over", (e) => {
      const data: { winner: "villagers" | "werewolves" } = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;
      const next = { ...current, winner: data.winner, awaiting: null };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("done", () => {
      const current = gameRef.current;
      if (!current) return;
      const next = { ...current, awaiting: null };
      gameRef.current = next;
      setGame(next);
      setCurrentNode(null);
    });

    source.addEventListener("error", (e) => {
      const raw = (e as MessageEvent).data;
      if (raw) {
        try {
          const data = JSON.parse(raw);
          setErrorMessage(data.message ?? "Unknown error");
        } catch {
          setErrorMessage("Connection error");
        }
      }
    });

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, [sessionId]);

  return { game, active, connected, errorMessage, currentNode, metrics };
}
