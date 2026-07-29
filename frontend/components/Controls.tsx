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
  // `submitting` only covers the in-flight fetch itself, so the controls
  // re-enabled the instant it resolved -- well before the backend actually
  // advanced past this turn, letting a human fire off several submissions
  // for what should be a single answer. `awaiting` gets a new object
  // reference every time a genuinely new turn starts (see
  // orchestrator.py's _run / useGameStream.ts's "awaiting_input" handler),
  // so locking on submit and clearing only when `awaiting` itself changes
  // keeps the controls disabled for the entire rest of this turn. Compared
  // during render via a second piece of state rather than a ref -- this
  // project's stricter hooks lint (react-hooks/refs) forbids reading/writing
  // a ref during render, so this uses React's own documented "adjusting
  // state while rendering" pattern instead of the ref-diffing idiom.
  const [locked, setLocked] = useState(false);
  const [prevAwaiting, setPrevAwaiting] = useState(awaiting);
  if (prevAwaiting !== awaiting) {
    setPrevAwaiting(awaiting);
    setLocked(false);
  }

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
          disabled={submitting || locked}
        />
        <button
          className="btn"
          disabled={submitting || locked}
          onClick={() => {
            setLocked(true);
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
            disabled={submitting || locked}
            onClick={() => {
              setLocked(true);
              onSubmit({ target: option });
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </>
  );
}
