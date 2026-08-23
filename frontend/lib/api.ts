import type {
  AgentConfig,
  BranchPoint,
  DeceptionReport,
  GameState,
  GameOptions,
  GameAccessCredentials,
  CreatedGame,
  GraphStructure,
  GameBranch,
  ModelPreflightResponse,
  PerspectiveSnapshot,
  TournamentReport,
  RelationshipMemory,
  ReplayShareRecord,
  ResolvedReplay,
  Timeline,
} from "./types";

const LOCAL_API_PORT = 8000;
const configuredApiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function isVercelBrowserHost(hostname: string): boolean {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

function localApiBase(hostname: string): string {
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `http://${host}:${LOCAL_API_PORT}`;
}

/** Browser builds only honor NEXT_PUBLIC_API_URL on a Vercel hostname. Every
 * local or LAN hostname is deliberately paired with Python on the same host. */
export const IS_LOCAL_API = typeof window !== "undefined" && !isVercelBrowserHost(window.location.hostname);
export const API_BASE = IS_LOCAL_API
  ? localApiBase(window.location.hostname)
  : configuredApiBase;

const BACKEND_WAKE_TIMEOUT_MS = IS_LOCAL_API ? 20_000 : 180_000;
const HEALTH_REQUEST_TIMEOUT_MS = 12_000;
const HEALTH_RETRY_DELAY_MS = IS_LOCAL_API ? 750 : 2_000;

export type BackendWakeProgress = {
  status: "checking" | "retrying" | "ready";
  attempt: number;
  elapsedMs: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A remote free instance can be asleep when the first visitor arrives. Keep
 * the setup page in a visible readiness phase until the real backend confirms
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
      // A starting local server or sleeping remote instance can drop the first
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

  throw new Error(IS_LOCAL_API
    ? `The local Python server is not responding at ${API_BASE}. Start it with ./start.sh and try again.`
    : "The game server did not wake within 3 minutes. Render may still be restarting; wait a moment and try again."
  );
}

export async function createGame(
  configs: AgentConfig[],
  options?: GameOptions
): Promise<CreatedGame> {
  const res = await fetch(`${API_BASE}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ? { seats: configs, options } : configs),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to create game (${res.status})`);
  }
  return res.json();
}

function accessParams(access?: GameAccessCredentials, includeHost = true): string {
  if (!access) return "";
  const params = new URLSearchParams({
    seat_id: access.seatId,
    access_token: access.accessToken,
  });
  if (includeHost && access.hostToken) params.set("host_token", access.hostToken);
  return `?${params}`;
}

function hostParams(access?: GameAccessCredentials): string {
  if (!access?.hostToken) return "";
  return `?${new URLSearchParams({ host_token: access.hostToken })}`;
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

export async function fetchState(sessionId: string, access?: GameAccessCredentials): Promise<GameState> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/state${accessParams(access)}`);
  if (!res.ok) throw new Error(`Failed to fetch state (${res.status})`);
  return res.json();
}

/** Request narration for one immutable public statement. The backend resolves
 * the text from its own log; browser-provided arbitrary text is never voiced. */
export async function fetchCouncilVoice(
  sessionId: string,
  seq: number,
  access?: GameAccessCredentials
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/voice/${seq}${accessParams(access)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Lifelike voice unavailable (${res.status})`);
  }
  return res.blob();
}

export async function submitInput(
  sessionId: string,
  body: { seat_id: string; kind: string; value: Record<string, unknown> },
  access?: GameAccessCredentials
): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: access?.accessToken }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to submit input (${res.status})`);
  }
}

export function streamUrl(sessionId: string, access?: GameAccessCredentials): string {
  return `${API_BASE}/games/${sessionId}/stream${accessParams(access)}`;
}

export async function pauseGame(sessionId: string, access?: GameAccessCredentials): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/pause${hostParams(access)}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to pause game (${res.status})`);
}

export async function continueGame(sessionId: string, access?: GameAccessCredentials): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/continue${hostParams(access)}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to continue game (${res.status})`);
}

export async function stopGame(sessionId: string, access?: GameAccessCredentials): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/stop${hostParams(access)}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to stop game (${res.status})`);
}

export async function beginGame(sessionId: string, access?: GameAccessCredentials): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/begin${hostParams(access)}`, { method: "POST" });
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
export async function fetchTimeline(sessionId: string, access?: GameAccessCredentials): Promise<Timeline> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/timeline${hostParams(access)}`);
  if (!res.ok) throw new Error(`Failed to fetch timeline (${res.status})`);
  return res.json();
}

export async function fetchPerspective(
  sessionId: string,
  seatId: string,
  throughSeq?: number,
  access?: GameAccessCredentials
): Promise<PerspectiveSnapshot> {
  const params = new URLSearchParams({ seat_id: seatId });
  if (throughSeq !== undefined) params.set("through_seq", String(throughSeq));
  if (access?.hostToken) params.set("host_token", access.hostToken);
  const res = await fetch(`${API_BASE}/games/${sessionId}/perspective?${params}`);
  if (!res.ok) throw new Error(`Failed to reconstruct perspective (${res.status})`);
  return res.json();
}

export async function fetchDeceptionReport(
  sessionId: string,
  godMode = true,
  access?: GameAccessCredentials
): Promise<DeceptionReport> {
  const res = await fetch(
    `${API_BASE}/games/${sessionId}/deception-report?${new URLSearchParams({
      god_mode: godMode ? "true" : "false",
      ...(access?.hostToken ? { host_token: access.hostToken } : {}),
      ...(access ? { seat_id: access.seatId, access_token: access.accessToken } : {}),
    })}`
  );
  if (!res.ok) throw new Error(`Failed to build deception report (${res.status})`);
  return res.json();
}

export async function fetchBranchPoints(sessionId: string, access?: GameAccessCredentials): Promise<BranchPoint[]> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/branch-points${hostParams(access)}`);
  if (!res.ok) throw new Error(`Failed to load branch points (${res.status})`);
  return res.json();
}

export async function createBranch(
  sessionId: string,
  checkpointId: string,
  replacement: Record<string, unknown>,
  access?: GameAccessCredentials
): Promise<CreatedGame & { lineage: GameBranch }> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/branches${hostParams(access)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkpoint_id: checkpointId, replacement }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to create branch (${res.status})`);
  }
  return res.json();
}

export async function fetchLineage(sessionId: string, access?: GameAccessCredentials): Promise<GameBranch | null> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/lineage${accessParams(access)}`);
  if (!res.ok) return null;
  const value = await res.json();
  return value.branch ?? null;
}

export async function createTournament(body: {
  lineup: AgentConfig[];
  game_count: number;
  concurrency: number;
  max_total_tokens: number;
  max_estimated_cost_usd: number;
}): Promise<{ tournament_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/tournaments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail?.[0]?.msg ?? detail?.detail ?? `Failed to create tournament (${res.status})`);
  }
  return res.json();
}

export async function fetchTournament(tournamentId: string): Promise<TournamentReport> {
  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}`);
  if (!res.ok) throw new Error(`Failed to load tournament (${res.status})`);
  return res.json();
}

export async function fetchRoom(
  sessionId: string,
  hostToken: string
): Promise<{ room_code: string; human_seats: { seat_id: string; name: string; claimed: boolean }[] }> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/room?${new URLSearchParams({ host_token: hostToken })}`);
  if (!res.ok) throw new Error(`Failed to load room (${res.status})`);
  return res.json();
}

export async function rotateRoomSeatToken(
  sessionId: string,
  seatId: string,
  hostToken: string
): Promise<{ seat_id: string; access_token: string }> {
  const res = await fetch(
    `${API_BASE}/games/${sessionId}/room/${seatId}/rotate-token?${new URLSearchParams({ host_token: hostToken })}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Failed to rotate seat link (${res.status})`);
  return res.json();
}

export async function replaceRoomSeatWithAi(
  sessionId: string,
  seatId: string,
  hostToken: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${sessionId}/room/${seatId}/replace-with-ai?${new URLSearchParams({ host_token: hostToken })}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to replace human seat (${res.status})`);
  }
}

export async function fetchRelationships(ownerName?: string): Promise<RelationshipMemory[]> {
  const query = ownerName ? `?${new URLSearchParams({ owner_name: ownerName })}` : "";
  const res = await fetch(`${API_BASE}/relationships${query}`);
  if (!res.ok) throw new Error(`Failed to load relationship memories (${res.status})`);
  return res.json();
}

export async function editRelationship(memoryId: number, memory: string): Promise<void> {
  const res = await fetch(`${API_BASE}/relationships/${memoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memory }),
  });
  if (!res.ok) throw new Error(`Failed to edit relationship memory (${res.status})`);
}

export async function deleteRelationship(memoryId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/relationships/${memoryId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to erase relationship memory (${res.status})`);
}

export async function createReplayShare(
  sessionId: string,
  body: { scope: "public" | "god"; expires_in_hours: number | null },
  access?: GameAccessCredentials
): Promise<{ share_id: string; scope: "public" | "god"; secret: string | null; expires_at: string | null }> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/shares${hostParams(access)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Failed to create replay link (${res.status})`);
  }
  return res.json();
}

export async function listReplayShares(
  sessionId: string,
  access?: GameAccessCredentials
): Promise<ReplayShareRecord[]> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/shares${hostParams(access)}`);
  if (!res.ok) throw new Error(`Failed to list replay links (${res.status})`);
  return res.json();
}

export async function revokeReplayShare(
  sessionId: string,
  shareId: string,
  access?: GameAccessCredentials
): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${sessionId}/shares/${shareId}${hostParams(access)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to revoke replay link (${res.status})`);
}

export async function fetchReplay(shareId: string, secret?: string): Promise<ResolvedReplay> {
  const query = secret ? `?${new URLSearchParams({ secret })}` : "";
  const res = await fetch(`${API_BASE}/replays/${shareId}${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error("This replay is invalid, expired, revoked, or requires its God Mode secret.");
  return res.json();
}
