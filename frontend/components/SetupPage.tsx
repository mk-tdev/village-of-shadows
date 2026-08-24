"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createGame, IS_LOCAL_API, preflightModels, waitForBackend } from "@/lib/api";
import type { BackendWakeProgress } from "@/lib/api";
import { defaultSeats, PROVIDER_MODEL_SUGGESTIONS, PROVIDER_OPTIONS } from "@/lib/seatDefaults";
import { SeatRow } from "@/components/SeatRow";
import { Select } from "@/components/Select";
import { Combobox } from "@/components/Combobox";
import { AgentLabPanel } from "@/components/AgentLabPanel";
import { ThemedCheckbox } from "@/components/ThemedCheckbox";
import type { AgentConfig, GameOptions, ModelPreflightResult, Provider } from "@/lib/types";

type StartPhase = "idle" | "waking" | "checking" | "creating";
type ProgressState = "pending" | "active" | "complete" | "failed";

function LaunchStep({
  number,
  title,
  detail,
  state,
}: {
  number: string;
  title: string;
  detail: string;
  state: ProgressState;
}) {
  return (
    <li className={`launch-step ${state}`}>
      <span className="launch-step-mark" aria-hidden="true">
        {state === "complete" ? "✓" : state === "failed" ? "×" : number}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </li>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [humanIndex, setHumanIndex] = useState(0);
  const [humanIndices, setHumanIndices] = useState<number[]>([0]);
  const [seats, setSeats] = useState<AgentConfig[]>(() => defaultSeats(0));
  const [startPhase, setStartPhase] = useState<StartPhase>("idle");
  const [failedPhase, setFailedPhase] = useState<Exclude<StartPhase, "idle"> | null>(null);
  const [wakeProgress, setWakeProgress] = useState<BackendWakeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preflightResults, setPreflightResults] = useState<ModelPreflightResult[]>([]);
  const [prediction, setPrediction] = useState("");
  const [options, setOptions] = useState<GameOptions>({
    version: 1,
    role_pack: "standard",
    village_events: false,
    cross_game_memory: false,
    room_name: "The Village",
    max_game_tokens: 500_000,
  });
  // The master picker's own selection -- kept separate from any one seat's
  // provider/model so it still has a sensible value to apply even after
  // per-seat edits have made the seats disagree with each other, and so a
  // seat that later flips from human to AI (see updateHumanIndex) has a
  // more useful fallback than always defaulting back to "mock".
  const [masterProvider, setMasterProvider] = useState<Provider>("mock");
  const [masterModel, setMasterModel] = useState<string>(PROVIDER_MODEL_SUGGESTIONS.mock[0].value);

  const duplicateNames = useMemo(() => {
    const names = seats.map((s) => s.display_name.trim().toLowerCase());
    return new Set(names).size !== names.length;
  }, [seats]);

  const canStart = !duplicateNames && seats.every((s) => s.display_name.trim().length > 0);
  const starting = startPhase !== "idle";

  const wakeStepState: ProgressState = failedPhase === "waking"
    ? "failed"
    : wakeProgress?.status === "ready"
      ? "complete"
      : startPhase === "waking"
        ? "active"
        : "pending";
  const modelStepState: ProgressState = failedPhase === "checking" || preflightResults.some((result) => !result.ok)
    ? "failed"
    : preflightResults.length > 0 && preflightResults.every((result) => result.ok)
      ? "complete"
      : startPhase === "checking"
        ? "active"
        : "pending";
  const createStepState: ProgressState = failedPhase === "creating"
    ? "failed"
    : startPhase === "creating"
      ? "active"
      : "pending";

  function clearLaunchFeedback() {
    if (starting) return;
    setFailedPhase(null);
    setWakeProgress(null);
  }

  function selectPrimaryHuman(index: number) {
    clearLaunchFeedback();
    setPreflightResults([]);
    setError(null);
    const nextHumanIndices = [
      index,
      ...humanIndices.filter((item) => item !== humanIndex && item !== index),
    ].sort((a, b) => a - b);
    setHumanIndex(index);
    setHumanIndices(nextHumanIndices);
    setSeats((current) => current.map((seat, seatIndex) => {
      const isHuman = nextHumanIndices.includes(seatIndex);
      return {
        ...seat,
        controller: isHuman ? "human" : "ai",
        provider: isHuman ? null : seat.provider ?? masterProvider,
        model_name: isHuman ? null : seat.model_name ?? masterModel,
        endpoint: isHuman ? null : seat.endpoint,
      };
    }));
  }

  function toggleHuman(index: number, enabled: boolean) {
    if (!enabled && index === humanIndex) return;
    clearLaunchFeedback();
    setPreflightResults([]);
    setError(null);
    const nextHumans = enabled
      ? [...new Set([...humanIndices, index])].sort((a, b) => a - b)
      : humanIndices.filter((item) => item !== index);
    setHumanIndices(nextHumans);
    setSeats((current) => current.map((seat, seatIndex) => seatIndex === index ? {
      ...seat,
      controller: enabled ? "human" : "ai",
      provider: enabled ? null : seat.provider ?? masterProvider,
      model_name: enabled ? null : seat.model_name ?? masterModel,
    } : seat));
  }

  function updateSeat(index: number, next: AgentConfig) {
    clearLaunchFeedback();
    setPreflightResults([]);
    setError(null);
    setSeats((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function applyMasterToAllAiSeats(provider: Provider, modelName: string) {
    clearLaunchFeedback();
    setPreflightResults([]);
    setError(null);
    setSeats((prev) =>
      prev.map((s) =>
        s.controller === "human"
          ? s
          : {
              ...s,
              provider,
              model_name: modelName,
              endpoint: provider === "ollama" ? "http://localhost:11434" : null,
            }
      )
    );
  }

  function handleMasterProviderChange(value: string) {
    const provider = value as Provider;
    const defaultModel = PROVIDER_MODEL_SUGGESTIONS[provider][0].value;
    setMasterProvider(provider);
    setMasterModel(defaultModel);
    applyMasterToAllAiSeats(provider, defaultModel);
  }

  function handleMasterModelChange(value: string) {
    setMasterModel(value);
    applyMasterToAllAiSeats(masterProvider, value);
  }

  async function handleStart() {
    setError(null);
    setPreflightResults([]);
    setFailedPhase(null);
    setWakeProgress({ status: "checking", attempt: 1, elapsedMs: 0 });
    setStartPhase("waking");
    let activePhase: Exclude<StartPhase, "idle"> = "waking";
    try {
      await waitForBackend(setWakeProgress);
      activePhase = "checking";
      setStartPhase("checking");
      const preflight = await preflightModels(seats);
      setPreflightResults(preflight.results);
      if (!preflight.ok) {
        setError("One or more AI seats failed the readiness check. Fix them before starting.");
        setFailedPhase("checking");
        setStartPhase("idle");
        return;
      }
      activePhase = "creating";
      setStartPhase("creating");
      const created = await createGame(seats, options);
      const { session_id } = created;
      const primary = created.human_seats.find((seat) => seat.seat_id === seats[humanIndex].seat_id) ?? created.human_seats[0];
      const credentials = {
        seatId: primary.seat_id,
        accessToken: primary.access_token,
        hostToken: created.host_token,
      };
      try {
        window.localStorage.setItem(
          `village-learning:${session_id}`,
          JSON.stringify({ prediction: prediction.trim(), created_at: new Date().toISOString() })
        );
        window.localStorage.setItem(`village-access:${session_id}`, JSON.stringify(credentials));
        window.localStorage.setItem(`village-room:${session_id}`, JSON.stringify(created));
      } catch {
        // The experiment worksheet is a convenience, never a prerequisite
        // for creating a game (private browsing can disable localStorage).
      }
      const query = new URLSearchParams({
        seat_id: credentials.seatId,
        access_token: credentials.accessToken,
        host_token: credentials.hostToken,
      });
      router.push(
        created.human_seats.length > 1
          ? `/room/${session_id}?${query}`
          : `/game/${session_id}?${query}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
      setFailedPhase(activePhase);
      setStartPhase("idle");
    }
  }

  return (
    <div className="app">
      <header style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Link className="setup-back-link" href="/">← Return to the village gates</Link>
          <h1 className="village-title">Village of Shadows</h1>
          <div className="subtitle">Configure the seven seats, then begin.</div>
        </div>
        <Link className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: 12.5, flexShrink: 0 }} href="/how-to-play">
          How to play
        </Link>
        <Link className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: 12.5, flexShrink: 0 }} href="/relationships">
          Relationship archive
        </Link>
      </header>

      <div className="setup-card">
        <section className="primary-seat-picker" aria-labelledby="primary-seat-title">
          <div className="primary-seat-heading">
            <div>
              <span>YOUR PLACE IN THE VILLAGE</span>
              <h2 id="primary-seat-title">Which character do you want to play?</h2>
            </div>
            <small>Choose any of the seven seats. The other six remain AI unless you invite more people below.</small>
          </div>
          <div className="primary-seat-grid" role="radiogroup" aria-label="Choose your character">
            {seats.map((seat, index) => {
              const selected = index === humanIndex;
              return (
                <button
                  key={seat.seat_id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-selected" : ""}
                  onClick={() => selectPrimaryHuman(index)}
                >
                  <span className="primary-seat-number">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{seat.display_name || seat.seat_id}</strong>
                  <small>{seat.personality || "unwritten personality"}</small>
                  <b>{selected ? "YOU PLAY HERE" : humanIndices.includes(index) ? "INVITED HUMAN" : "CHOOSE"}</b>
                </button>
              );
            })}
          </div>
        </section>

        <details className="multi-human-picker">
          <summary>
            <span>Invite more human players <b>optional</b></span>
            <small>{humanIndices.length === 1 ? "Solo human game" : `${humanIndices.length} human seats selected`}</small>
          </summary>
          <div>{seats.map((seat, index) => <ThemedCheckbox key={seat.seat_id} checked={humanIndices.includes(index)} disabled={index === humanIndex} onChange={(checked) => toggleHuman(index, checked)} ariaLabel={`${seat.display_name} is a human player`}>{seat.display_name}{index === humanIndex ? " · you" : ""}</ThemedCheckbox>)}</div>
          <p>Your seat is always human. Each additional selection receives a private, seat-bound join link; every unselected seat stays AI.</p>
        </details>

        <label className="field-label">Set every AI seat to</label>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            maxWidth: 420,
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: "1px solid rgba(232, 163, 61, 0.12)",
          }}
        >
          <div style={{ minWidth: 150 }}>
            <Select value={masterProvider} options={PROVIDER_OPTIONS} onChange={handleMasterProviderChange} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Combobox
              value={masterModel}
              options={PROVIDER_MODEL_SUGGESTIONS[masterProvider]}
              onChange={handleMasterModelChange}
              placeholder="Model name or custom ID"
            />
          </div>
        </div>

        {seats.map((seat, i) => (
          <SeatRow
            key={seat.seat_id}
            seat={seat}
            isHuman={seat.controller === "human"}
            onChange={(next) => updateSeat(i, next)}
          />
        ))}

        <section className="world-rules-config">
          <div><span>WORLD RULES · VERSION 1</span><h2>Choose how strange this village becomes</h2></div>
          <ThemedCheckbox checked={options.role_pack === "expanded"} onChange={(checked) => setOptions((current) => ({ ...current, role_pack: checked ? "expanded" : "standard" }))}><span><b>Expanded roles</b><small>Add Hunter, Mayor, and Jester with server-enforced rules.</small></span></ThemedCheckbox>
          <ThemedCheckbox checked={options.village_events} onChange={(checked) => setOptions((current) => ({ ...current, village_events: checked }))}><span><b>Dynamic village events</b><small>Deterministic silence, sealed ballots, forced testimony, and discovered evidence.</small></span></ThemedCheckbox>
          <ThemedCheckbox checked={options.cross_game_memory} onChange={(checked) => setOptions((current) => ({ ...current, cross_game_memory: checked }))}><span><b>Cross-game relationships</b><small>Opt in to inspectable memories from previous games. Roles are never carried forward.</small></span></ThemedCheckbox>
        </section>

        <AgentLabPanel seats={seats} onChange={updateSeat} />

        <section className="learning-prediction" aria-labelledby="learning-prediction-title">
          <span className="learning-kicker">LEARNING EXPERIMENT · OPTIONAL</span>
          <h2 id="learning-prediction-title">Predict before you play</h2>
          <p>
            Which agent will gain trust, misread the evidence, or change the outcome — and why?
            Your prediction stays in this browser and returns in the post-game debrief.
          </p>
          <textarea
            value={prediction}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder="Example: The cautious model will survive longer, but the aggressive model will drive the first vote."
            rows={3}
          />
        </section>

        {duplicateNames && (
          <p className="error-text" style={{ marginTop: 12 }}>
            Seat names must be unique.
          </p>
        )}
        {error && (
          <p className="error-text" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {wakeProgress && (
          <section className="launch-progress" aria-live="polite" aria-busy={starting}>
            <div className="launch-progress-heading">
              <div>
                <span className="launch-progress-kicker">LAUNCH SEQUENCE</span>
                <h2>Preparing the village</h2>
              </div>
              {startPhase === "waking" && (
                <span className="launch-elapsed">
                  {Math.max(0, Math.floor(wakeProgress.elapsedMs / 1000))}s elapsed
                </span>
              )}
            </div>

            <ol className="launch-steps">
              <LaunchStep
                number="1"
                title="Wake the game server"
                detail={wakeStepState === "complete"
                  ? (IS_LOCAL_API ? "Local FastAPI server is healthy." : "Render is online and healthy.")
                  : (IS_LOCAL_API ? "Checking the Python API on port 8000." : "Wait for the FastAPI service to become ready.")}
                state={wakeStepState}
              />
              <LaunchStep
                number="2"
                title="Test every AI model"
                detail="Each configured model must answer and call a validation tool."
                state={modelStepState}
              />
              <LaunchStep
                number="3"
                title="Create the village"
                detail="Save the seven seats, then open the connected game."
                state={createStepState}
              />
            </ol>

            {startPhase === "waking" && (
              <div className="server-wake-note">
                <span className="server-wake-orb" aria-hidden="true" />
                <span>
                  <strong>{IS_LOCAL_API
                    ? (wakeProgress.status === "retrying" ? "The local Python server is not ready yet." : "Checking the local Python server...")
                    : (wakeProgress.status === "retrying" ? "The server is still waking up." : "Contacting the sleeping server...")}
                  </strong>
                  <small>{IS_LOCAL_API
                    ? <>Local play always uses <code>http://localhost:8000</code>. Start <code>./start.sh</code> if needed</>
                    : <>Render&apos;s free service may take a minute or more on the first visit. Retrying automatically</>}
                    {wakeProgress.attempt > 1 ? ` · attempt ${wakeProgress.attempt}` : ""}.
                  </small>
                </span>
              </div>
            )}
          </section>
        )}

        {preflightResults.length > 0 && (
          <div className="preflight-panel" aria-live="polite">
            <div className="preflight-title">AI model readiness</div>
            {preflightResults.map((result) => (
              <div className={`preflight-row ${result.ok ? "ok" : "failed"}`} key={result.seat_id}>
                <span className="preflight-status" aria-hidden="true">{result.ok ? "✓" : "×"}</span>
                <span>
                  <strong>{result.display_name}</strong> · {result.model_name}
                  <small>{result.message}{result.latency_ms > 0 ? ` · ${result.latency_ms} ms` : ""}</small>
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          className="btn"
          style={{ marginTop: 18 }}
          disabled={!canStart || starting}
          onClick={handleStart}
        >
          {startPhase === "waking"
            ? "Waking game server..."
            : startPhase === "checking"
              ? "Checking every AI model..."
              : startPhase === "creating"
                ? "Creating village..."
                : "Test Models & Start Game"}
        </button>
      </div>
    </div>
  );
}
