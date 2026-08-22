import type { AgentConfig, GameState, GraphStructure, ModelPreflightResponse, Timeline } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const BACKEND_WAKE_TIMEOUT_MS = 180_000;
const HEALTH_REQUEST_TIMEOUT_MS = 12_000;
const HEALTH_RETRY_DELAY_MS = 2_000;

export type BackendWakeProgress = {
  status: "checking" | "retrying" | "ready";
  attempt: number;
  elapsedMs: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Render's free instances can be asleep when the first visitor arrives. Keep
 * the setup page in a visible wake-up phase until the real backend confirms
 * that its full FastAPI lifespan has completed and /health returns {ok:true}.
 */
export async function waitForBackend(
  onProgress?: (progress: BackendWakeProgress) => void
): Promise<{ attempts: number; elapsedMs: number }> {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < BACKEND_WAKE_TIMEOUT_MS) {
    attempt += 1;
    const report = (status: BackendWakeProgress["status"]) =>
      onProgress?.({ status, attempt, elapsedMs: Date.now() - startedAt });

    report("checking");
    const heartbeat = setInterval(() => report("checking"), 1_000);
    const controller = new AbortController();
    const remainingMs = BACKEND_WAKE_TIMEOUT_MS - (Date.now() - startedAt);
    const requestTimeout = setTimeout(
      () => controller.abort(),
      Math.min(HEALTH_REQUEST_TIMEOUT_MS, Math.max(1, remainingMs))
    );

    try {
      const res = await fetch(`${API_BASE}/health`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      const payload = res.ok ? await res.json().catch(() => null) : null;
      if (res.ok && payload?.ok === true) {
        const elapsedMs = Date.now() - startedAt;
        onProgress?.({ status: "ready", attempt, elapsedMs });
        return { attempts: attempt, elapsedMs };
      }
    } catch {
      // A sleeping Render instance commonly drops or times out the first
      // request. Retrying is the intended recovery path.
    } finally {
      clearInterval(heartbeat);
      clearTimeout(requestTimeout);
    }

    report("retrying");
    const remainingAfterAttempt = BACKEND_WAKE_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingAfterAttempt > 0) {
      await delay(Math.min(HEALTH_RETRY_DELAY_MS, remainingAfterAttempt));
    }
  }

  throw new Error(
    "The game server did not wake within 3 minutes. Render may still be restarting; wait a moment and try again."
  );
}

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

export async function preflightModels(configs: AgentConfig[]): Promise<ModelPreflightResponse> {
  const res = await fetch(`${API_BASE}/games/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to check models (${res.status})`);
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
