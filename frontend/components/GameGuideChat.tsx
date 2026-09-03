"use client";

import { useEffect, useRef, useState } from "react";
import { streamGameGuide } from "@/lib/api";
import type { GameAccessCredentials } from "@/lib/types";

type Message = { id: string; author: "guide" | "player"; text: string };

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  })}</>;
}

function MessageMarkdown({ text }: { text: string }) {
  // Older completions occasionally placed Markdown bullets after a sentence
  // instead of on their own line. Normalize that harmless display quirk too.
  const lines = text
    .replace(/\r/g, "")
    .replace(/:\s+-\s+(?=\*\*|[A-Z])/g, ":\n- ")
    .replace(/([.!?])\s+-\s+(?=\*\*|[A-Z])/g, "$1\n- ")
    .split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    const unordered = /^[-*]\s+(.+)$/.exec(lines[index]);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(lines[index]);
    if (unordered || ordered) {
      const tag = unordered ? "ul" : "ol";
      const items: string[] = [];
      const pattern = tag === "ul" ? /^[-*]\s+(.+)$/ : /^\d+[.)]\s+(.+)$/;
      while (index < lines.length) {
        const match = pattern.exec(lines[index]);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      const List = tag;
      blocks.push(<List key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^[-*]\s+(.+)$/.test(lines[index]) && !/^\d+[.)]\s+(.+)$/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}><InlineMarkdown text={paragraph.join(" ")} /></p>);
  }
  return <div className="game-guide-markdown">{blocks}</div>;
}

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
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldFollowReplyRef = useRef(true);
  const messageCounterRef = useRef(0);
  const [messages, setMessages] = useState<Message[]>([
    { id: "guide-intro", author: "guide", text: "Ask about this game’s visible events, roles, rules, current phase, or your available action. I use the Game Guide but cannot change the game." },
  ]);

  const messageId = () => `guide-${++messageCounterRef.current}`;

  useEffect(() => {
    const list = messageListRef.current;
    if (list && shouldFollowReplyRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function trackScroll() {
    const list = messageListRef.current;
    if (!list) return;
    shouldFollowReplyRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 36;
  }

  async function send() {
    const question = draft.trim();
    if (!question || sending) return;
    setDraft("");
    setSending(true);
    shouldFollowReplyRef.current = true;
    const playerMessage = messageId();
    const guideMessage = messageId();
    setMessages((previous) => [...previous, { id: playerMessage, author: "player", text: question }]);
    if (!access) {
      setMessages((previous) => [...previous, {
        id: guideMessage,
        author: "guide",
        text: "Open this game from your protected seat link to ask about its live state.",
      }]);
      setSending(false);
      return;
    }
    setStreamingMessageId(guideMessage);
    setMessages((previous) => [...previous, { id: guideMessage, author: "guide", text: "" }]);
    try {
      await streamGameGuide(sessionId, access, question, (text) => {
        setMessages((previous) => previous.map((item) => item.id === guideMessage ? { ...item, text: item.text + text } : item));
      });
    } catch (reason) {
      setMessages((previous) => previous.map((item) => item.id === guideMessage ? {
        ...item,
        text: item.text || (reason instanceof Error ? reason.message : "The game guide is unavailable right now."),
      } : item));
    } finally {
      setSending(false);
      setStreamingMessageId(null);
    }
  }

  return (
    <aside className={`game-guide${open ? " is-open" : ""}`} aria-label="Game guide chat">
      <button className="game-guide-tab" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>◇</span> Ask about the game
      </button>
      {open ? <section className="game-guide-panel">
        <header><div><span>READ-ONLY GAME GUIDE</span><h2>{active ? "Live council context" : "Game review context"}</h2></div><button type="button" aria-label="Close game guide" onClick={() => setOpen(false)}>×</button></header>
        <div className="game-guide-messages" ref={messageListRef} onScroll={trackScroll}>
          {messages.map((message) => <article className={`is-${message.author}`} key={message.id} aria-live={message.id === streamingMessageId ? "polite" : undefined}>
            <b>{message.author === "guide" ? "Guide" : "You"}</b>
            {message.author === "guide" ? (message.text ? <MessageMarkdown text={message.text} /> : <span className="game-guide-typing">Thinking<span>.</span><span>.</span><span>.</span></span>) : <p>{message.text}</p>}
          </article>)}
        </div>
        <div className="game-guide-compose">
          <textarea value={draft} maxLength={500} rows={3} placeholder={access ? "e.g. What is happening this round?" : "Open your protected game link first"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <button className="btn" type="button" disabled={!draft.trim() || sending} onClick={() => void send()}>{sending ? "Thinking…" : "Ask guide"}</button>
        </div>
      </section> : null}
    </aside>
  );
}
