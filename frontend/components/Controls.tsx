"use client";

import { useState } from "react";
import type { AwaitingInput } from "@/lib/types";

export function Controls({
  awaiting,
  paused,
  onSubmit,
  onContinue,
  submitting,
}: {
  awaiting: AwaitingInput | null;
  paused: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
  onContinue: () => void;
  submitting: boolean;
}) {
  const [text, setText] = useState("");

  if (paused) {
    return (
      <>
        <div className="controls-hint">⏸ Game paused — the orchestrator has suspended between turns.</div>
        <button className="btn" onClick={onContinue}>
          Continue
        </button>
      </>
    );
  }

  if (!awaiting) {
    return <div className="controls-hint">The village is deciding what happens next...</div>;
  }

  if (awaiting.kind === "statement") {
    return (
      <>
        <div className="controls-hint">{awaiting.prompt}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to say to the village?"
        />
        <button
          className="btn"
          disabled={submitting}
          onClick={() => {
            onSubmit({ text: text.trim() || "(says nothing)" });
            setText("");
          }}
        >
          Speak
        </button>
      </>
    );
  }

  // "vote" and "night_action" both resolve to picking a name from options.
  return (
    <>
      <div className="controls-hint">{awaiting.prompt}</div>
      <div className="vote-grid">
        {awaiting.options.map((option) => (
          <button
            key={option}
            className="vote-btn"
            disabled={submitting}
            onClick={() => onSubmit({ target: option })}
          >
            {option}
          </button>
        ))}
      </div>
    </>
  );
}
