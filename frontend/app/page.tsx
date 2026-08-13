"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createGame, preflightModels } from "@/lib/api";
import { defaultSeats, PROVIDER_MODEL_SUGGESTIONS, PROVIDER_OPTIONS } from "@/lib/seatDefaults";
import { SeatRow } from "@/components/SeatRow";
import { Select } from "@/components/Select";
import { Combobox } from "@/components/Combobox";
import type { AgentConfig, ModelPreflightResult, Provider } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const [humanIndex, setHumanIndex] = useState(0);
  const [seats, setSeats] = useState<AgentConfig[]>(() => defaultSeats(0));
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
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

  function updateHumanIndex(index: number) {
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
    setPreflightResults([]);
    setError(null);
    setSeats((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function applyMasterToAllAiSeats(provider: Provider, modelName: string) {
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
    setStarting(true);
    setChecking(true);
    try {
      const preflight = await preflightModels(seats);
      setPreflightResults(preflight.results);
      setChecking(false);
      if (!preflight.ok) {
        setError("One or more AI seats failed the readiness check. Fix them before starting.");
        setStarting(false);
        return;
      }
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
      setChecking(false);
      setStarting(false);
    }
  }

  return (
    <div className="app">
      <header style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
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
          {checking ? "Checking every AI model..." : starting ? "Creating village..." : "Test Models & Start Game"}
        </button>
      </div>
    </div>
  );
}
