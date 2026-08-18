"use client";

import { useEffect, useRef, useState } from "react";
import { streamUrl } from "./api";
import type {
  ActivityEntry,
  AwaitingInput,
  DecisionEvent,
  GameState,
  InputAcceptedEvent,
  LogEntry,
  McpEvent,
  MemoryEvent,
  MindNodeEvent,
  Player,
  PrivateNoteEvent,
  SeatMetrics,
  SeerResultEvent,
  TurnEvent,
} from "./types";

export interface GameStreamState {
  game: GameState | null;
  active: TurnEvent | null;
  connected: boolean;
  errorMessage: string | null;
  currentNode: string | null;
  /** Which node of which seat's mind ran most recently, for the subgraph
   * diagram. Separate from `currentNode`: that's the *game* graph. */
  mindNode: MindNodeEvent | null;
  /** How many times each mind node has executed this game. The highlight alone
   * is unreadable with mock seats (a turn passes through in under a
   * millisecond), so these make the traffic visible even when it can't be
   * watched -- and they show at a glance that `reapply` only fires on a
   * pause/resume replay. */
  mindNodeCounts: Record<string, number>;
  metrics: Record<string, SeatMetrics>;
  activity: ActivityEntry[];
  /** Immutable note revisions for the God Mode observer. Agents can retrieve
   * only their own rows through their connection-bound MCP identity. */
  privateNotes: PrivateNoteEvent[];
}

const MAX_ACTIVITY_ENTRIES = 60;

/** Subscribes to /games/{id}/stream and reduces incoming SSE events into a
 * client-side GameState, mirroring the shape the werewolf_game.html
 * prototype rendered directly off of. See plan §9 / §5 -- SSE replaces the
 * WebSocket channel there, human input still goes over its own POST.
 *
 * Also tracks three things purely for the debug panel: which LangGraph node
 * is currently executing ("node" events), per-seat token/latency metrics
 * accumulated from "decision" events, and a rolling live-activity feed built
 * from "node"/"turn"/"mcp"/"decision" events together -- see routers/graph.py
 * and agent_turn.py on the backend for where these originate. */
export function useGameStream(sessionId: string): GameStreamState {
  const [game, setGame] = useState<GameState | null>(null);
  const [active, setActive] = useState<TurnEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [mindNode, setMindNode] = useState<MindNodeEvent | null>(null);
  const [mindNodeCounts, setMindNodeCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<Record<string, SeatMetrics>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [privateNotes, setPrivateNotes] = useState<PrivateNoteEvent[]>([]);
  const gameRef = useRef<GameState | null>(null);
  const activityIdRef = useRef(0);

  useEffect(() => {
    const source = new EventSource(streamUrl(sessionId));

    function pushActivity(kind: ActivityEntry["kind"], text: string) {
      activityIdRef.current += 1;
      const entry: ActivityEntry = { id: activityIdRef.current, kind, text };
      setActivity((prev) => [entry, ...prev].slice(0, MAX_ACTIVITY_ENTRIES));
    }

    source.addEventListener("open", () => setConnected(true));

    source.addEventListener("state", (e) => {
      const data: GameState = JSON.parse((e as MessageEvent).data);
      gameRef.current = data;
      setGame(data);
    });

    source.addEventListener("private_notes", (e) => {
      const data: { events: PrivateNoteEvent[] } = JSON.parse((e as MessageEvent).data);
      setPrivateNotes(data.events);
    });

    source.addEventListener("private_note", (e) => {
      const note: PrivateNoteEvent = JSON.parse((e as MessageEvent).data);
      setPrivateNotes((previous) =>
        previous.some((event) => event.event_key === note.event_key)
          ? previous
          : [...previous, note]
      );
      pushActivity(
        "note",
        `${note.name ?? note.seat_id} ${note.operation === "create" ? "recorded" : `${note.operation}d`} a private ${note.kind}`
      );
    });

    // Fired once, right after assign_roles runs (see nodes.py). The initial
    // "state" snapshot above is taken at connect time, which (since a game
    // no longer auto-starts -- see 07-pausing-with-interrupt.md) is almost
    // always *before* roles exist, and nothing else ever refreshes
    // game.players afterward. Without this, "god mode" has nothing to
    // reveal until the browser is refreshed.
    source.addEventListener("roles_assigned", (e) => {
      const data: { players: Player[] } = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;
      const next: GameState = { ...current, players: data.players };
      gameRef.current = next;
      setGame(next);
    });

    // Seer knowledge changes after the one-time "state" snapshot. Keep the
    // nested per-seat map intact while folding the new private discovery into
    // local state, so the human seer's player cards can reveal only the roles
    // they have actually investigated.
    source.addEventListener("seer_result", (e) => {
      const data: SeerResultEvent = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current) return;
      const next: GameState = {
        ...current,
        seer_knowledge: {
          ...current.seer_knowledge,
          [data.seat_id]: {
            ...(current.seer_knowledge[data.seat_id] ?? {}),
            [data.target]: data.role,
          },
        },
      };
      gameRef.current = next;
      setGame(next);
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
      // Every log entry carries the phase/round that was current the
      // instant it was logged (see nodes.py's _log/_append_log) -- without
      // applying it here, `game.phase` would stay frozen at whatever the
      // initial "state" snapshot showed (now "lobby", see 07's begin_game
      // section) for the rest of the connection, since no other event
      // updates it. That left the lobby's Start Game prompt showing forever
      // once the game actually started, even though the backend had moved on
      // (it was a modal overlay then; it's inline in the controls panel now,
      // but it still keys off phase === "lobby", so this still matters).
      const next: GameState = {
        ...current,
        players,
        phase: entry.phase,
        round: entry.round,
        log: [...current.log, entry],
      };
      gameRef.current = next;
      setGame(next);
    });

    source.addEventListener("turn", (e) => {
      const data: TurnEvent = JSON.parse((e as MessageEvent).data);
      setActive(data.seat_id ? data : null);
      if (data.seat_id) pushActivity("turn", `${data.name} is taking their turn`);
    });

    source.addEventListener("node", (e) => {
      const data: { node: string; phase?: string; round?: number } = JSON.parse((e as MessageEvent).data);
      setCurrentNode(data.node);
      pushActivity("node", `Orchestrator entered ${data.node}`);

      // phase/round otherwise only ever come from the one-time initial
      // "state" snapshot -- nothing else updates them, so without this a
      // browser that connected while the game was still in "lobby" (see
      // GameView.tsx, which swaps the Start Game prompt for the real controls
      // on exactly that value) would never learn the game had actually
      // started.
      const current = gameRef.current;
      if (current && data.phase !== undefined && (current.phase !== data.phase || current.round !== data.round)) {
        const next: GameState = { ...current, phase: data.phase, round: data.round ?? current.round };
        gameRef.current = next;
        setGame(next);
      }
    });

    source.addEventListener("mind_node", (e) => {
      const data: MindNodeEvent = JSON.parse((e as MessageEvent).data);
      setMindNode(data);
      setMindNodeCounts((prev) => ({ ...prev, [data.node]: (prev[data.node] ?? 0) + 1 }));
    });

    source.addEventListener("mcp", (e) => {
      const data: McpEvent = JSON.parse((e as MessageEvent).data);
      pushActivity(
        "mcp",
        data.action === "bind"
          ? `${data.name} opened an MCP session (${data.phase})`
          : `${data.name} called MCP tool “${data.tool}”`
      );
    });

    source.addEventListener("decision", (e) => {
      const data: DecisionEvent = JSON.parse((e as MessageEvent).data);
      pushActivity("decision", `${data.name} committed a decision — ${data.latency_ms}ms`);
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

    // Folded into the same per-seat metrics record the "decision" handler
    // builds, so the debug table can show memory depth next to token usage.
    // Merged rather than replaced because a "memory" event carries only the
    // message count -- it must not clobber provider/model/token fields that
    // only "decision" events know about, and it can arrive for a seat that
    // has no metrics row yet.
    source.addEventListener("memory", (e) => {
      const data: MemoryEvent = JSON.parse((e as MessageEvent).data);
      // Only worth a feed line when a turn was actually replayed -- otherwise
      // this would just restate the "decision" entry that already fired. A
      // replay means a pause interrupted this node and the graph re-ran it, so
      // the seat re-applied its decision without re-remembering it (see
      // seat_mind.py's _reapply); that's exactly the sort of thing the panel
      // exists to make visible.
      if (data.replayed) {
        pushActivity("memory", `${data.name} replayed a turn — memory left at ${data.messages}`);
      }
      setMetrics((prev) => {
        const existing = prev[data.seat_id];
        return {
          ...prev,
          [data.seat_id]: {
            seat_id: data.seat_id,
            name: data.name,
            provider: existing?.provider ?? null,
            model_name: existing?.model_name ?? null,
            calls: existing?.calls ?? 0,
            input_tokens: existing?.input_tokens ?? 0,
            output_tokens: existing?.output_tokens ?? 0,
            last_latency_ms: existing?.last_latency_ms ?? 0,
            estimated: existing?.estimated ?? false,
            memory_messages: data.messages,
          },
        };
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

    // Positive acknowledgement for a human action. The POST response alone
    // cannot mutate EventSource-owned state, so without this event the old
    // vote prompt can remain visible after the backend has already resumed.
    source.addEventListener("input_accepted", (e) => {
      const data: InputAcceptedEvent = JSON.parse((e as MessageEvent).data);
      const current = gameRef.current;
      if (!current?.awaiting) return;
      if (
        current.awaiting.seat_id !== data.seat_id ||
        current.awaiting.kind !== data.kind
      ) return;
      const next: GameState = { ...current, awaiting: null };
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
      // The game is over, so no mind is mid-thought either. Counts stay --
      // they're the record of the finished game, not live state.
      setMindNode(null);
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

  return {
    game, active, connected, errorMessage, currentNode,
    mindNode, mindNodeCounts, metrics, activity, privateNotes,
  };
}
