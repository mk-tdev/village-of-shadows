"use client";

import { useState } from "react";
import { askGameGuide } from "@/lib/api";
import type { GameAccessCredentials } from "@/lib/types";

type Message = { author: "guide" | "player"; text: string };

export function GameGuideChat({
  sessionId,
  access,
  active,
}: {
  sessionId: string;
  access: GameAccessCredentials | null;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { author: "guide", text: "Ask about this game’s visible events, roles, rules, current phase, or your available action. I use the Game Guide but cannot change the game." },
  ]);

  async function send() {
    const question = draft.trim();
    if (!question || sending) return;
    setDraft("");
    setSending(true);
    setMessages((previous) => [...previous, { author: "player", text: question }]);
    if (!access) {
      setMessages((previous) => [...previous, {
        author: "guide",
        text: "Open this game from your protected seat link to ask about its live state.",
      }]);
      setSending(false);
      return;
    }
    try {
      const answer = await askGameGuide(sessionId, access, question);
      setMessages((previous) => [...previous, { author: "guide", text: answer }]);
    } catch (reason) {
      setMessages((previous) => [...previous, {
        author: "guide",
        text: reason instanceof Error ? reason.message : "The game guide is unavailable right now.",
      }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className={`game-guide${open ? " is-open" : ""}`} aria-label="Game guide chat">
      <button className="game-guide-tab" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>◇</span> Ask about the game
      </button>
      {open ? <section className="game-guide-panel" aria-live="polite">
        <header><div><span>READ-ONLY GAME GUIDE</span><h2>{active ? "Live council context" : "Game review context"}</h2></div><button type="button" aria-label="Close game guide" onClick={() => setOpen(false)}>×</button></header>
        <div className="game-guide-messages">
          {messages.map((message, index) => <p className={`is-${message.author}`} key={`${message.author}-${index}`}><b>{message.author === "guide" ? "Guide" : "You"}</b>{message.text}</p>)}
        </div>
        <div className="game-guide-compose">
          <textarea value={draft} maxLength={500} rows={3} placeholder={access ? "e.g. What is happening this round?" : "Open your protected game link first"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <button className="btn" type="button" disabled={!draft.trim() || sending} onClick={() => void send()}>{sending ? "Thinking…" : "Ask guide"}</button>
        </div>
      </section> : null}
    </aside>
  );
}
