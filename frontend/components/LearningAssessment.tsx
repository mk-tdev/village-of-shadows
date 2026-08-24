"use client";

import { useMemo, useState } from "react";
import type { Timeline } from "@/lib/types";

type Question = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correct: string;
  explanation: string;
};

const QUESTIONS: Question[] = [
  {
    id: "orchestration",
    prompt: "What does LangGraph decide in Village of Shadows?",
    options: [
      { id: "story", label: "Whom every agent should trust and accuse" },
      { id: "world", label: "Turn order, phases, interrupts, and rule transitions" },
      { id: "roles", label: "The most persuasive dialogue for each secret role" },
    ],
    correct: "world",
    explanation: "The graph owns the world state and transitions. Models decide behavior inside those boundaries.",
  },
  {
    id: "partial-observability",
    prompt: "Why can two agents reach different conclusions from the same round?",
    options: [
      { id: "shared", label: "They share one hidden global conversation" },
      { id: "random", label: "The server randomly replaces their memories" },
      { id: "private", label: "Each has a private role, memory, persona, and permitted view" },
    ],
    correct: "private",
    explanation: "Partial observability and independent memory make each seat's evidence and interpretation genuinely different.",
  },
  {
    id: "human-loop",
    prompt: "What happens when a human-controlled seat must act?",
    options: [
      { id: "interrupt", label: "Execution suspends until the human submits a valid action" },
      { id: "predict", label: "An AI predicts the action and the human approves it later" },
      { id: "timeout", label: "The turn is skipped after a fixed model timeout" },
    ],
    correct: "interrupt",
    explanation: "LangGraph uses a real interrupt/resume boundary. Human and AI actions then pass through the same rules.",
  },
  {
    id: "tools",
    prompt: "What does a rejected tool call demonstrate?",
    options: [
      { id: "model", label: "The model provider is necessarily unavailable" },
      { id: "validation", label: "Autonomy is bounded by identity and game-rule validation" },
      { id: "hidden", label: "The application exposes hidden chain-of-thought" },
    ],
    correct: "validation",
    explanation: "Agents propose actions through tools; the authoritative rule layer accepts or rejects them before state changes.",
  },
  {
    id: "memory",
    prompt: "How is one agent's history kept independent from another's?",
    options: [
      { id: "thread", label: "Each seat uses its own checkpoint thread and conversation history" },
      { id: "prompt", label: "All agents receive the same transcript with different names" },
      { id: "browser", label: "The browser stores every model's private prompt" },
    ],
    correct: "thread",
    explanation: "The shared seat-mind graph is separated by per-seat thread IDs, preserving private conversation memory.",
  },
];

type SavedAssessment = {
  answers: Record<string, string>;
  scored: boolean;
  completedAt?: string;
};

function loadSavedAssessment(storageKey: string): SavedAssessment {
  if (typeof window === "undefined") return { answers: {}, scored: false };
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as SavedAssessment) : { answers: {}, scored: false };
  } catch {
    return { answers: {}, scored: false };
  }
}

function learningReport(
  timeline: Timeline,
  prediction: string,
  answers: Record<string, string>,
  score: number,
  completedAt: string,
): string {
  const debrief = timeline.learning_debrief;
  const responseLines = QUESTIONS.flatMap((question, index) => {
    const selected = question.options.find((option) => option.id === answers[question.id]);
    const correct = answers[question.id] === question.correct;
    return [
      `### ${index + 1}. ${question.prompt}`,
      `- Response: ${selected?.label ?? "Not answered"}`,
      `- Result: ${correct ? "Correct" : "Review"}`,
      `- Concept: ${question.explanation}`,
      "",
    ];
  });
  const conceptLines = (debrief?.concept_evidence ?? []).map(
    (item) => `- **${item.concept}:** ${item.evidence}`,
  );
  const experimentLines = (debrief?.next_experiments ?? []).map((item) => `- ${item}`);

  return [
    "# Village of Shadows — Learning Report",
    "",
    `- Session: ${timeline.session_id}`,
    `- Completed: ${completedAt}`,
    `- Outcome: ${timeline.winner ?? "unknown"}`,
    `- Concept check: ${score}/${QUESTIONS.length}`,
    `- Graph steps: ${timeline.total_steps ?? 0}`,
    `- Persisted events: ${timeline.events.length}`,
    `- Human interrupts: ${debrief?.human_interrupts.length ?? 0}`,
    `- Validated tool calls: ${debrief?.tool_totals.all ?? 0}`,
    "",
    "## Pre-game prediction",
    "",
    prediction || "No prediction was recorded.",
    "",
    "## Concept check",
    "",
    ...responseLines,
    "## Evidence from this run",
    "",
    ...(conceptLines.length ? conceptLines : ["- No learning evidence was available."]),
    "",
    "## Next experiments",
    "",
    ...(experimentLines.length ? experimentLines : ["- Replay with one changed model or personality."]),
    "",
    "> This report records observable game behavior, stated rationale, tool calls, and orchestration evidence. It does not expose hidden chain-of-thought.",
    "",
  ].join("\n");
}

export function LearningAssessment({
  sessionId,
  timeline,
  prediction,
}: {
  sessionId: string;
  timeline: Timeline;
  prediction: string;
}) {
  const storageKey = `village-learning-check:${sessionId}`;
  const [saved] = useState(() => loadSavedAssessment(storageKey));
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers);
  const [scored, setScored] = useState(saved.scored);
  const [completedAt, setCompletedAt] = useState(saved.completedAt ?? "");
  const answered = Object.keys(answers).filter((id) => QUESTIONS.some((question) => question.id === id)).length;
  const score = useMemo(
    () => QUESTIONS.filter((question) => answers[question.id] === question.correct).length,
    [answers],
  );

  function save(nextAnswers: Record<string, string>, nextScored: boolean, nextCompletedAt = completedAt) {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ answers: nextAnswers, scored: nextScored, completedAt: nextCompletedAt }),
      );
    } catch {
      // The assessment remains usable for this page view when storage is unavailable.
    }
  }

  function choose(questionId: string, optionId: string) {
    if (scored) return;
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    save(next, false);
  }

  function scoreAssessment() {
    if (answered !== QUESTIONS.length) return;
    const now = new Date().toISOString();
    setCompletedAt(now);
    setScored(true);
    save(answers, true, now);
  }

  function revise() {
    setScored(false);
    setCompletedAt("");
    save(answers, false, "");
  }

  function downloadReport() {
    const content = learningReport(
      timeline,
      prediction,
      answers,
      score,
      completedAt || new Date().toISOString(),
    );
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `village-of-shadows-learning-${sessionId.slice(0, 8)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="learning-assessment" aria-labelledby="learning-assessment-title">
      <header>
        <div>
          <span className="learning-kicker">MEASURABLE LEARNING</span>
          <h3 id="learning-assessment-title">Prove what you understood</h3>
          <p>Five questions connect this run to reusable agentic-AI concepts. Answers stay in this browser.</p>
        </div>
        <div className={`learning-score ${scored ? "is-scored" : ""}`}>
          <strong>{scored ? `${score}/${QUESTIONS.length}` : `${answered}/${QUESTIONS.length}`}</strong>
          <span>{scored ? "concepts correct" : "answered"}</span>
        </div>
      </header>

      <ol className="learning-question-list">
        {QUESTIONS.map((question, questionIndex) => (
          <li key={question.id} className={scored ? (answers[question.id] === question.correct ? "is-correct" : "is-review") : ""}>
            <div className="learning-question-title">
              <span>{String(questionIndex + 1).padStart(2, "0")}</span>
              <h4>{question.prompt}</h4>
            </div>
            <div className="learning-options" role="group" aria-label={question.prompt}>
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id;
                const correct = scored && option.id === question.correct;
                return (
                  <button
                    type="button"
                    key={option.id}
                    aria-pressed={selected}
                    className={`${selected ? "is-selected" : ""} ${correct ? "is-answer" : ""}`}
                    onClick={() => choose(question.id, option.id)}
                    disabled={scored}
                  >
                    <i aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            {scored ? <p className="learning-explanation">{question.explanation}</p> : null}
          </li>
        ))}
      </ol>

      <footer>
        <p>{scored ? "Export a portable record of your prediction, score, evidence, and next experiments." : "Complete every question to score the reflection."}</p>
        <div>
          {scored ? <button type="button" className="btn-ghost" onClick={revise}>Revise answers</button> : null}
          <button
            type="button"
            className="btn learning-assessment-action"
            disabled={!scored && answered !== QUESTIONS.length}
            onClick={scored ? downloadReport : scoreAssessment}
          >
            {scored ? "Download learning report" : "Score my reflection"}
          </button>
        </div>
      </footer>
    </section>
  );
}
