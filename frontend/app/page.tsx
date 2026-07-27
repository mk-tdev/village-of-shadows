"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createGame } from "@/lib/api";
import { defaultSeats } from "@/lib/seatDefaults";
import { SeatRow } from "@/components/SeatRow";
import { Select } from "@/components/Select";
import type { AgentConfig } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const [humanIndex, setHumanIndex] = useState(0);
  const [seats, setSeats] = useState<AgentConfig[]>(() => defaultSeats(0));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicateNames = useMemo(() => {
    const names = seats.map((s) => s.display_name.trim().toLowerCase());
    return new Set(names).size !== names.length;
  }, [seats]);

  const canStart = !duplicateNames && seats.every((s) => s.display_name.trim().length > 0);

  function updateHumanIndex(index: number) {
    setHumanIndex(index);
    setSeats((prev) =>
      prev.map((s, i) => ({
        ...s,
        controller: i === index ? "human" : "ai",
        provider: i === index ? null : s.provider ?? "mock",
        model_name: i === index ? null : s.model_name ?? "mock-v1",
      }))
    );
  }

  function updateSeat(index: number, next: AgentConfig) {
    setSeats((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      const { session_id } = await createGame(seats);
      router.push(`/game/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
      setStarting(false);
    }
  }

  return (
    <div className="app">
      <header style={{ marginBottom: 22 }}>
        <h1 className="village-title">Village of Shadows</h1>
        <div className="subtitle">Configure the seven seats, then begin.</div>
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

        {seats.map((seat, i) => (
          <SeatRow
            key={seat.seat_id}
            seat={seat}
            isHuman={i === humanIndex}
            onChange={(next) => updateSeat(i, next)}
          />
        ))}

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

        <button
          className="btn"
          style={{ marginTop: 18 }}
          disabled={!canStart || starting}
          onClick={handleStart}
        >
          {starting ? "Starting..." : "Start Game"}
        </button>
      </div>
    </div>
  );
}
