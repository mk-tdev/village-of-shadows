import type { AgentConfig, GameState, GraphStructure, Timeline } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function createGame(configs: AgentConfig[]): Promise<{ session_id: string }> {
  const res = await fetch(`${API_BASE}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to create game (${res.status})`);
  }
  return res.json();
}

export async function fetchState(sessionId: string): Promise<GameState> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/state`);
  if (!res.ok) throw new Error(`Failed to fetch state (${res.status})`);
  return res.json();
}

export async function submitInput(
  sessionId: string,
  body: { seat_id: string; kind: string; value: Record<string, unknown> }
): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to submit input (${res.status})`);
  }
}

export function streamUrl(sessionId: string): string {
  return `${API_BASE}/games/${sessionId}/stream`;
}

export async function pauseGame(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/pause`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to pause game (${res.status})`);
}

export async function continueGame(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/continue`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to continue game (${res.status})`);
}

export async function stopGame(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/stop`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop game (${res.status})`);
}

export async function beginGame(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/begin`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to begin game (${res.status})`);
}

export async function fetchGraphStructure(): Promise<GraphStructure> {
  const res = await fetch(`${API_BASE}/graph/structure`);
  if (!res.ok) throw new Error(`Failed to fetch graph structure (${res.status})`);
  return res.json();
}

/** The post-game technical report. Reconstructed on demand from the
 * checkpointer (LangGraph time travel), so it costs nothing while a game is
 * being played and is available for any game whose checkpoints still exist. */
export async function fetchTimeline(sessionId: string): Promise<Timeline> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/timeline`);
  if (!res.ok) throw new Error(`Failed to fetch timeline (${res.status})`);
  return res.json();
}
