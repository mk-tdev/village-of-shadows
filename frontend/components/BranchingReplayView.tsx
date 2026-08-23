"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBranch, fetchBranchPoints } from "@/lib/api";
import type { BranchPoint, GameAccessCredentials } from "@/lib/types";
import { Select } from "@/components/Select";

export function BranchingReplayView({ sessionId, access }: { sessionId: string; access?: GameAccessCredentials }) {
  const router = useRouter();
  const [points, setPoints] = useState<BranchPoint[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBranchPoints(sessionId, access)
      .then((value) => {
        if (cancelled) return;
        setPoints(value);
        setSelectedId(value.at(-1)?.checkpoint_id ?? "");
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not load branch points");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId, access]);

  const point = points.find((item) => item.checkpoint_id === selectedId) ?? null;
  const needsText = point?.kind === "statement" || point?.kind === "werewolf_negotiation";

  const launch = async () => {
    if (!point) return;
    const replacement: Record<string, unknown> = {};
    if (needsText) replacement.text = text.trim() || "I reconsider the evidence and choose a different course.";
    if (point.kind !== "statement") replacement.target = target || point.options[0];
    if (point.kind !== "statement" && point.kind !== "werewolf_negotiation") {
      replacement.thought = "Counterfactual decision selected from the replay laboratory.";
    }
    setCreating(true);
    setError(null);
    try {
      const result = await createBranch(sessionId, point.checkpoint_id, replacement, access);
      const primary = result.human_seats.find((seat) => seat.seat_id === access?.seatId) ?? result.human_seats[0];
      const credentials = { seatId: primary.seat_id, accessToken: primary.access_token, hostToken: result.host_token };
      try { window.localStorage.setItem(`village-access:${result.session_id}`, JSON.stringify(credentials)); } catch {}
      router.push(`/game/${result.session_id}?${new URLSearchParams({ seat_id: credentials.seatId, access_token: credentials.accessToken, host_token: credentials.hostToken })}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create branch");
      setCreating(false);
    }
  };

  if (loading) return <p className="metrics-empty">Finding eligible human decision checkpoints…</p>;

  return (
    <div className="summary-view branching-replay-view">
      <header className="summary-section-heading is-hero">
        <div><span>LANGGRAPH TIME TRAVEL</span><h3>Change one decision. Keep both worlds.</h3></div>
        <p>The original game remains immutable. A new checkpoint thread inherits only the knowledge and memory available at the selected moment.</p>
      </header>
      {points.length === 0 ? (
        <p className="metrics-empty">This run has no restorable human decision interrupts.</p>
      ) : (
        <section className="branch-lab">
          <div className="branch-thread-visual" aria-hidden="true">
            <span>ORIGINAL</span><i /><b>◈</b><i className="is-branch" /><span>NEW TIMELINE</span>
          </div>
          <label>
            Decision checkpoint
            <Select value={selectedId} ariaLabel="Decision checkpoint" options={points.map((item) => ({
              value: item.checkpoint_id,
              label: `Round ${item.round} · ${item.phase} · ${item.kind}`,
              sublabel: `Event #${item.log_seq}`,
            }))} onChange={(next) => {
              setSelectedId(next);
              const selected = points.find((item) => item.checkpoint_id === next);
              setTarget(selected?.options[0] ?? "");
              setText("");
            }} />
          </label>
          {point ? (
            <div className="branch-decision-card">
              <span>ORIGINAL INTERRUPT</span><p>{point.prompt}</p>
              {needsText ? (
                <label>Replacement words<textarea value={text} maxLength={320} onChange={(event) => setText(event.target.value)} /></label>
              ) : null}
              {point.kind !== "statement" ? (
                <label>Replacement target<Select value={target || point.options[0] || ""} onChange={setTarget} ariaLabel="Replacement target" options={point.options.map((option) => ({ value: option, label: option }))} /></label>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn" type="button" disabled={!point || creating} onClick={launch}>
            {creating ? "Cloning checkpoint…" : "Fork this decision"}
          </button>
        </section>
      )}
    </div>
  );
}
