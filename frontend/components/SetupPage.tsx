"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createGame, preflightModels, waitForBackend } from "@/lib/api";
import type { BackendWakeProgress } from "@/lib/api";
import { defaultSeats, PROVIDER_MODEL_SUGGESTIONS, PROVIDER_OPTIONS } from "@/lib/seatDefaults";
import { SeatRow } from "@/components/SeatRow";
import { Select } from "@/components/Select";
import { Combobox } from "@/components/Combobox";
import type { AgentConfig, ModelPreflightResult, Provider } from "@/lib/types";

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
  const [seats, setSeats] = useState<AgentConfig[]>(() => defaultSeats(0));
  const [startPhase, setStartPhase] = useState<StartPhase>("idle");
  const [failedPhase, setFailedPhase] = useState<Exclude<StartPhase, "idle"> | null>(null);
  const [wakeProgress, setWakeProgress] = useState<BackendWakeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preflightResults, setPreflightResults] = useState<ModelPreflightResult[]>([]);
  const [prediction, setPrediction] = useState("");
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

  function updateHumanIndex(index: number) {
    clearLaunchFeedback();
    setPreflightResults([]);
    setError(null);
    setHumanIndex(index);
    setSeats((prev) =>
      prev.map((s, i) => ({
        ...s,
        controller: i === index ? "human" : "ai",
        provider: i === index ? null : s.provider ?? masterProvider,
        model_name: i === index ? null : s.model_name ?? masterModel,
      }))
    );
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
      prev.map((s, i) =>
        i === humanIndex
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
      const { session_id } = await createGame(seats);
      try {
        window.localStorage.setItem(
          `village-learning:${session_id}`,
          JSON.stringify({ prediction: prediction.trim(), created_at: new Date().toISOString() })
        );
      } catch {
        // The experiment worksheet is a convenience, never a prerequisite
        // for creating a game (private browsing can disable localStorage).
      }
      router.push(`/game/${session_id}`);
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
      </header>

      <div className="setup-card">
        <label className="field-label">Which seat do you want to play?</label>
        <div style={{ marginBottom: 16, maxWidth: 220 }}>
          <Select
            value={String(humanIndex)}
            options={seats.map((s, i) => ({ value: String(i), label: s.display_name || s.seat_id }))}
            onChange={(value) => updateHumanIndex(Number(value))}
          />
        </div>

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
            isHuman={i === humanIndex}
            onChange={(next) => updateSeat(i, next)}
          />
        ))}

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
                detail={wakeStepState === "complete" ? "Render is online and healthy." : "Wait for the FastAPI service to become ready."}
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
                  <strong>
                    {wakeProgress.status === "retrying" ? "The server is still waking up." : "Contacting the sleeping server..."}
                  </strong>
                  <small>
                    Render&apos;s free service may take a minute or more on the first visit. Retrying automatically
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
