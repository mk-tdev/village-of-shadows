"use client";

import { useEffect, useRef, useState } from "react";
import type { AwaitingInput } from "@/lib/types";
import styles from "./missing-villager.module.css";

const CHAPTERS = ["The scream", "The empty house", "Three witnesses", "The council"];

export function MissingVillagerInvestigation({ awaiting, submitting, onSubmit }: {
  awaiting: AwaitingInput;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => Promise<boolean>;
}) {
  const [lockedTurn, setLockedTurn] = useState<string | null>(null);
  const locked = lockedTurn === awaiting.turn_id;
  const inFlight = useRef<string | null>(null);
  const notebookRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [audioError, setAudioError] = useState(false);
  useEffect(() => () => { const context = audioRef.current; if (context && context.state !== "closed") void context.close().catch(() => {}); }, []);
  async function hearScream() {
    try {
      await audioRef.current?.close();
      const context = new AudioContext();
      audioRef.current = context;
      await context.resume();
      const now = context.currentTime;
      const voice = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      voice.type = "sawtooth";
      voice.frequency.setValueAtTime(440, now);
      voice.frequency.exponentialRampToValueAtTime(870, now + .45);
      voice.frequency.exponentialRampToValueAtTime(260, now + 2.8);
      filter.type = "bandpass";
      filter.frequency.value = 1450;
      filter.Q.value = .8;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.055, now + .3);
      gain.gain.exponentialRampToValueAtTime(.0001, now + 3.2);
      const tremor = context.createOscillator();
      const depth = context.createGain();
      tremor.frequency.value = 7;
      depth.gain.value = 28;
      tremor.connect(depth).connect(voice.frequency);
      voice.connect(filter).connect(gain).connect(context.destination);
      voice.start(); tremor.start();
      voice.stop(now + 3.3); tremor.stop(now + 3.3);
      voice.onended = () => { if (context.state !== "closed") void context.close().catch(() => {}); if (audioRef.current === context) audioRef.current = null; };
    } catch { setAudioError(true); }
  }
  const view = awaiting.investigation!;
  useEffect(() => {
    const notebook = notebookRef.current;
    if (notebook) notebook.scrollTo({ top: notebook.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [view.clues.length, view.interviews.length]);
  const chapter = view.stage === "arrival" ? 0 : view.stage === "house" ? 1 : 2;
  const present = view.choices.filter((choice) => choice.id.startsWith("present:"));
  const choices = view.choices.filter((choice) => !choice.id.startsWith("present:"));
  async function act(action: string) {
    if (inFlight.current === awaiting.turn_id) return;
    inFlight.current = awaiting.turn_id ?? "pending";
    setLockedTurn(awaiting.turn_id ?? "pending");
    if (!await onSubmit({ action, turn_id: awaiting.turn_id })) {
      inFlight.current = null;
      setLockedTurn(null);
    }
  }
  return (
    <section className={styles.case} aria-labelledby="case-title">
      <header className={styles.hero}>
        <span className={styles.eyebrow}>A VILLAGE OF SHADOWS EPISODE · 01</span>
        <h2 id="case-title">Night of the<br /><em>Missing Villager</em></h2>
        <p>{chapter === 0 ? "A scream. Then silence. The bellkeeper’s lantern is still burning, but his chair is empty." : chapter === 1 ? "A chair overturned. Cold ash on the floor. Someone wants you to believe a very particular story." : "Three people. Three accounts. Someone remembers a night that never happened."}</p>
        {chapter === 0 && <button className={styles.listen} type="button" onClick={() => void hearScream()}>◖ Hear the distant cry · sound on demand</button>}
        {audioError && <p role="status">Sound is unavailable. You can continue with the written clues.</p>}
        <ol className={styles.chapters} aria-label="Episode progress">
          {CHAPTERS.map((label, index) => <li key={label} aria-current={index === chapter ? "step" : undefined}><span>{index < chapter ? "✓" : `0${index + 1}`}</span>{label}</li>)}
        </ol>
      </header>
      <aside className={styles.lesson} aria-label="Learning concepts">
        <span className={styles.eyebrow}>WHAT THIS TEACHES</span>
        <h3>{chapter === 0 ? "Human-in-the-loop orchestration" : chapter === 1 ? "Evidence is not a conclusion" : "Partial observability and conflicting accounts"}</h3>
        <p>{chapter === 0 ? "LangGraph waits at an interrupt. Your choice resumes the saved investigation state; the next choice creates another checkpoint." : chapter === 1 ? "The casebook separates observed physical facts from interpretations. Each inspection updates your saved discoveries without making them public." : "Witnesses offer claims, not verified facts. Your private context differs from the council’s. Choosing what to present changes the information available to the agents."}</p>
        <small>{chapter === 0 ? "Try explaining: what changes when you follow the scream?" : chapter === 1 ? "Ask: does this clue support more than one explanation?" : "Predict: would withholding one clue change the council’s vote?"}</small>
      </aside>
      <div className={styles.body}>
        <div className={styles.heading}><span>{chapter === 0 ? "THE BELLKEEPER’S HOUSE" : chapter === 1 ? "SEARCH THE ROOM" : "PRIVATE QUESTIONS"}</span><small>{chapter === 1 ? `${view.clues.length}/2 traces examined` : chapter === 2 ? `${view.questioned}/3 witnesses questioned` : "Before the first council"}</small></div>
        {chapter === 1 && <div className={styles.room} aria-hidden="true"><div className={styles.window} /><div className={styles.lantern} /><div className={styles.ash} /><span>The flame moves. There is no wind.</span></div>}
        <div className={`${styles.choices} ${styles.actionSpace}`}>
          {choices.map((choice) => <button key={choice.id} disabled={locked || submitting} onClick={() => void act(choice.id)}><strong>{choice.label}</strong><span>{choice.detail}</span><b aria-hidden="true">↗</b></button>)}
        </div>
        {(view.clues.length > 0 || view.interviews.length > 0) && <div className={styles.notebook} ref={notebookRef} tabIndex={0} role="region" aria-label="Your casebook">
          <h3>Your casebook <small>Private until you speak</small></h3>
          {view.clues.map((clue) => <article key={clue.id}><span className={styles.fact}>OBSERVED · {clue.location}</span><h4>{clue.title}</h4><p>{clue.text}</p></article>)}
          {view.interviews.map((account, index) => <article key={`${account.name}:${account.question}`} className={styles.account}><span>WITNESS ACCOUNT · UNVERIFIED</span><h4>{account.name} <small>on {account.question}</small></h4><p {...(index === view.interviews.length - 1 ? { "aria-live": "polite" as const } : {})}>“{account.text}”</p></article>)}
        </div>}
        {present.length > 0 && <div className={styles.presentation}>
          <span className={styles.eyebrow}>THE FIRE IS LIT. THEY ARE WAITING.</span><h3>What will you tell the council?</h3>
          <p>Only the clues you present become public. You can recount the private interviews in your speaking turn. The village’s vote decides the bellkeeper’s fate.</p>
          <div className={styles.choices}>{present.map((choice) => <button key={choice.id} disabled={locked || submitting} onClick={() => void act(choice.id)}><strong>{choice.label}</strong><span>{choice.detail}</span><b aria-hidden="true">→</b></button>)}</div>
        </div>}
        <p className={styles.saving} role="status">{locked || submitting ? "Following your lead…" : "Your progress is saved. Choose your next lead."}</p>
      </div>
    </section>
  );
}
