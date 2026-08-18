"use client";

import { useState } from "react";
import type { AwaitingInput } from "@/lib/types";

export function Controls({
  awaiting,
  paused,
  onSubmit,
  onContinue,
  submitting,
  promptKey,
}: {
  awaiting: AwaitingInput | null;
  paused: boolean;
  onSubmit: (value: Record<string, unknown>) => Promise<boolean>;
  onContinue: () => void;
  submitting: boolean;
  promptKey: string | null;
}) {
  const [text, setText] = useState("");
  // Lock against a logical turn key, not the parsed object's identity. An SSE
  // reconnect can deliver the same pending prompt as a fresh object; comparing
  // references treated that duplicate as a new turn and re-enabled voting.
  const [lockedPromptKey, setLockedPromptKey] = useState<string | null>(null);
  const locked = promptKey !== null && lockedPromptKey === promptKey;

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
          onClick={async () => {
            setLockedPromptKey(promptKey);
            const accepted = await onSubmit({ text: text.trim() || "(says nothing)" });
            if (accepted) setText("");
            else setLockedPromptKey(null);
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
            onClick={async () => {
              setLockedPromptKey(promptKey);
              const accepted = await onSubmit({ target: option });
              if (!accepted) setLockedPromptKey(null);
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </>
  );
}
