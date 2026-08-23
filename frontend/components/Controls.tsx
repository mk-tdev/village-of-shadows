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
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  // Lock against a logical turn key, not the parsed object's identity. An SSE
  // reconnect can deliver the same pending prompt as a fresh object; comparing
  // references treated that duplicate as a new turn and re-enabled voting.
  const [lockedPromptKey, setLockedPromptKey] = useState<string | null>(null);
  const locked = promptKey !== null && lockedPromptKey === promptKey;
  const validSelectedTarget = awaiting?.options.includes(selectedTarget ?? "")
    ? selectedTarget
    : null;

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

  if (awaiting.kind === "werewolf_negotiation") {
    return (
      <div className="wolf-council-control">
        <div className="wolf-council-eyebrow">PRIVATE WEREWOLF COUNCIL</div>
        <div className="controls-hint">{awaiting.prompt}</div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Persuade your teammate, explain the threat, or coordinate tomorrow’s deception..."
          maxLength={320}
          disabled={submitting || locked}
        />
        <div className="wolf-council-budget">Private message · {text.length}/320 characters</div>
        <div className="vote-grid" aria-label="Proposed werewolf target">
          {awaiting.options.map((option) => (
            <button
              key={option}
              type="button"
              className={`vote-btn${validSelectedTarget === option ? " is-selected" : ""}`}
              aria-pressed={validSelectedTarget === option}
              disabled={submitting || locked}
              onClick={() => setSelectedTarget(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <button
          className="btn wolf-council-submit"
          disabled={submitting || locked || !validSelectedTarget || !text.trim()}
          onClick={async () => {
            if (!validSelectedTarget) return;
            setLockedPromptKey(promptKey);
            const accepted = await onSubmit({ target: validSelectedTarget, text: text.trim() });
            if (accepted) {
              setText("");
              setSelectedTarget(null);
            } else {
              setLockedPromptKey(null);
            }
          }}
        >
          Send private plan
        </button>
      </div>
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
