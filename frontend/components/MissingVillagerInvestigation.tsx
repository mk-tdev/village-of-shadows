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
  const [locked, setLocked] = useState(false);
  const inFlight = useRef(false);
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
  const chapter = view.stage === "arrival" ? 0 : view.stage === "house" ? 1 : 2;
  const present = view.choices.filter((choice) => choice.id.startsWith("present:"));
  const choices = view.choices.filter((choice) => !choice.id.startsWith("present:"));
  async function act(action: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLocked(true);
    if (!await onSubmit({ action, turn_id: awaiting.turn_id })) {
      inFlight.current = false;
      setLocked(false);
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
      <div className={styles.body}>
        <div className={styles.heading}><span>{chapter === 0 ? "THE BELLKEEPER’S HOUSE" : chapter === 1 ? "SEARCH THE ROOM" : "PRIVATE QUESTIONS"}</span><small>{chapter === 1 ? `${view.clues.length}/2 traces examined` : chapter === 2 ? `${view.questioned}/3 witnesses questioned` : "Before the first council"}</small></div>
        {chapter === 1 && <div className={styles.room} aria-hidden="true"><div className={styles.window} /><div className={styles.lantern} /><div className={styles.ash} /><span>The flame moves. There is no wind.</span></div>}
        <div className={styles.choices}>
          {choices.map((choice) => <button key={choice.id} disabled={locked || submitting} onClick={() => void act(choice.id)}><strong>{choice.label}</strong><span>{choice.detail}</span><b aria-hidden="true">↗</b></button>)}
        </div>
        {(view.clues.length > 0 || view.interviews.length > 0) && <div className={styles.notebook}>
          <h3>Your casebook <small>Private until you speak</small></h3>
          {view.clues.map((clue) => <article key={clue.id}><span className={styles.fact}>OBSERVED · {clue.location}</span><h4>{clue.title}</h4><p>{clue.text}</p></article>)}
          {view.interviews.map((account, index) => <article key={`${account.name}:${account.question}`} className={styles.account}><span>WITNESS ACCOUNT · UNVERIFIED</span><h4>{account.name} <small>on {account.question}</small></h4><p {...(index === view.interviews.length - 1 ? { "aria-live": "polite" as const } : {})}>“{account.text}”</p></article>)}
        </div>}
        {present.length > 0 && <div className={styles.presentation}>
          <span className={styles.eyebrow}>THE FIRE IS LIT. THEY ARE WAITING.</span><h3>What will you tell the council?</h3>
          <p>Only the clues you present become public. You can recount the private interviews in your speaking turn. The village’s vote decides the bellkeeper’s fate.</p>
          <div className={styles.choices}>{present.map((choice) => <button key={choice.id} disabled={locked || submitting} onClick={() => void act(choice.id)}><strong>{choice.label}</strong><span>{choice.detail}</span><b aria-hidden="true">→</b></button>)}</div>
        </div>}
        {locked && <p className={styles.saving} role="status">Following your lead…</p>}
      </div>
    </section>
  );
}
