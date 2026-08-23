"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchCouncilVoice } from "@/lib/api";
import type { GameAccessCredentials, LogEntry, Player } from "@/lib/types";
import { Select } from "@/components/Select";

type CachedLine = { text: string; seatId: string; voiceName: string | null };
type NeuralLine = { url: string; seatId: string };
type VoiceEngine = "neural" | "device";

const NATURAL_HINTS = [
  "natural", "premium", "enhanced", "neural", "studio", "ava", "samantha",
  "daniel", "serena", "arthur", "moira", "tessa", "karen", "veena", "rishi",
  "susan", "kate", "tom", "oliver", "aaron", "nicky",
];
const ROBOTIC_HINTS = ["compact", "espeak", "festival", "novelty", "whisper", "zarvox"];

function voiceScore(voice: SpeechSynthesisVoice): number {
  const label = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  let score = voice.localService ? 20 : 4;
  if (voice.lang.toLowerCase().startsWith("en")) score += 28;
  if (NATURAL_HINTS.some((hint) => label.includes(hint))) score += 35;
  if (ROBOTIC_HINTS.some((hint) => label.includes(hint))) score -= 80;
  return score;
}

function prepareForSpeech(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/;\s*/g, "; ")
    .replace(/:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

export function VoiceCouncil({
  sessionId,
  access,
  entries,
  players,
  onSpeaking,
}: {
  sessionId: string;
  access?: GameAccessCredentials;
  entries: LogEntry[];
  players: Player[];
  onSpeaking: (seatId: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(0.95);
  const [engine, setEngine] = useState<VoiceEngine>(() => {
    if (typeof window === "undefined") return "neural";
    return window.localStorage.getItem("village-voice-engine") === "device" ? "device" : "neural";
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const rankedVoices = useMemo(
    () => [...voices].sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name)),
    [voices],
  );
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("village-voice-assignments") ?? "{}"); }
    catch { return {}; }
  });
  const [status, setStatus] = useState("AI-generated voice · text captions remain authoritative.");
  const spoken = useRef(new Set<number>());
  const pending = useRef(new Set<number>());
  const neuralUnavailable = useRef(false);
  const mutedRef = useRef(false);
  const deviceCache = useRef(new Map<number, CachedLine>());
  const neuralCache = useRef(new Map<number, NeuralLine>());
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const lastSpoken = useRef<number | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => () => {
    currentAudio.current?.pause();
    window.speechSynthesis?.cancel();
    neuralCache.current.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

  const stopPlayback = () => {
    currentAudio.current?.pause();
    currentAudio.current = null;
    window.speechSynthesis?.cancel();
    onSpeaking(null);
  };

  const speakWithDevice = (entry: LogEntry, replay = false, afterNeuralFailure = false) => {
    if (!("speechSynthesis" in window) || !entry.seat_id || !entry.text || muted) {
      setStatus("No device voice is available; the complete caption remains visible.");
      return;
    }
    if (!replay && spoken.current.has(entry.seq)) return;
    const playerIndex = Math.max(players.findIndex((player) => player.seat_id === entry.seat_id), 0);
    const selectedName = assignments[entry.seat_id]
      ?? rankedVoices[playerIndex % Math.max(rankedVoices.length, 1)]?.name
      ?? null;
    const cached = deviceCache.current.get(entry.seq) ?? {
      text: prepareForSpeech(entry.text), seatId: entry.seat_id, voiceName: selectedName,
    };
    deviceCache.current.set(entry.seq, cached);
    const utterance = new SpeechSynthesisUtterance(cached.text);
    utterance.voice = rankedVoices.find((voice) => voice.name === cached.voiceName) ?? null;
    const profiles = [
      { rate: 0.90, pitch: 0.94 }, { rate: 0.94, pitch: 1.01 }, { rate: 0.88, pitch: 0.98 },
      { rate: 0.92, pitch: 0.91 }, { rate: 0.96, pitch: 1.03 }, { rate: 0.89, pitch: 0.96 },
      { rate: 0.93, pitch: 0.99 },
    ];
    const profile = profiles[playerIndex % profiles.length];
    utterance.rate = Math.max(0.65, Math.min(1.35, profile.rate * (rate / 0.95)));
    utterance.pitch = profile.pitch;
    utterance.onstart = () => {
      onSpeaking(cached.seatId);
      setStatus(`${afterNeuralFailure ? "Device fallback" : "Ancient device voice"} · ${players[playerIndex]?.name ?? "council speaker"}`);
    };
    utterance.onend = () => { onSpeaking(null); setStatus("AI-generated voice · text captions remain authoritative."); };
    utterance.onerror = () => { onSpeaking(null); setStatus("Voice failed; the complete caption is still visible."); };
    stopPlayback();
    window.speechSynthesis.speak(utterance);
    spoken.current.add(entry.seq);
    lastSpoken.current = entry.seq;
  };

  const speakWithNeuralVoice = async (entry: LogEntry, replay = false) => {
    if (!entry.seat_id || !entry.text || mutedRef.current) return;
    if (neuralUnavailable.current) {
      speakWithDevice(entry, replay, true);
      return;
    }
    if ((!replay && spoken.current.has(entry.seq)) || pending.current.has(entry.seq)) return;
    pending.current.add(entry.seq);
    const player = players.find((item) => item.seat_id === entry.seat_id);
    setStatus(`Summoning ${player?.name ?? "a council voice"}…`);
    try {
      let cached = neuralCache.current.get(entry.seq);
      if (!cached) {
        const blob = await fetchCouncilVoice(sessionId, entry.seq, access);
        cached = { url: URL.createObjectURL(blob), seatId: entry.seat_id };
        neuralCache.current.set(entry.seq, cached);
      }
      if (mutedRef.current) return;
      stopPlayback();
      const audio = new Audio(cached.url);
      currentAudio.current = audio;
      audio.playbackRate = rate;
      audio.onplay = () => {
        onSpeaking(cached!.seatId);
        setStatus(`Lifelike ancient voice · ${player?.name ?? "council speaker"} · AI-generated`);
      };
      audio.onended = () => {
        currentAudio.current = null;
        onSpeaking(null);
        setStatus("AI-generated voice · text captions remain authoritative.");
      };
      audio.onerror = () => {
        currentAudio.current = null;
        onSpeaking(null);
        setStatus("Neural playback failed; using the best available device voice.");
        speakWithDevice(entry, replay, true);
      };
      await audio.play();
      spoken.current.add(entry.seq);
      lastSpoken.current = entry.seq;
    } catch {
      // Do not repeat a known-unavailable API request for every line. Choosing
      // Neural again resets this circuit breaker and offers an explicit retry.
      neuralUnavailable.current = true;
      setStatus("Lifelike voice unavailable; using the best available device voice.");
      speakWithDevice(entry, replay, true);
    } finally {
      pending.current.delete(entry.seq);
    }
  };

  const speak = (entry: LogEntry, replay = false) => {
    if (engine === "neural") void speakWithNeuralVoice(entry, replay);
    else speakWithDevice(entry, replay);
  };

  useEffect(() => {
    if (!enabled || muted) return;
    const latest = [...entries].reverse().find((entry) => entry.type === "statement" && entry.seat_id && entry.text);
    // Speech begins outside the effect's synchronous render cycle. This is
    // also a useful yield before a just-arrived SSE caption starts playing.
    if (latest) queueMicrotask(() => speak(latest));
  // Settings affect the next line, not an automatic replay of this one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, enabled, muted]);

  const saveAssignment = (seatId: string, voiceName: string) => {
    const next = { ...assignments, [seatId]: voiceName };
    setAssignments(next);
    try { window.localStorage.setItem("village-voice-assignments", JSON.stringify(next)); } catch {}
  };
  const chooseEngine = (value: VoiceEngine) => {
    stopPlayback();
    if (value === "neural") neuralUnavailable.current = false;
    setEngine(value);
    try { window.localStorage.setItem("village-voice-engine", value); } catch {}
    setStatus(value === "neural"
      ? "Lifelike ancient voice selected · AI-generated."
      : "Best available device voice selected · no API usage.");
  };
  const skip = () => { stopPlayback(); setStatus("Voice skipped. Caption remains visible."); };
  const replay = () => {
    const seq = lastSpoken.current;
    const entry = seq === null ? null : entries.find((item) => item.seq === seq);
    if (entry) speak(entry, true);
  };

  return (
    <section className={`voice-council${enabled ? " is-enabled" : ""}`} aria-label="Voice council controls">
      <div><span>VOICE COUNCIL · ANCIENT CADENCE</span><strong>{status}</strong></div>
      {!enabled ? (
        <button type="button" onClick={() => setEnabled(true)}>Enable council voices</button>
      ) : <>
        <label>Voice
          <Select className="is-compact" value={engine} onChange={(value) => chooseEngine(value as VoiceEngine)} ariaLabel="Voice engine" options={[
            { value: "neural", label: "Lifelike", sublabel: "Neural · ancient performance" },
            { value: "device", label: "Local", sublabel: "Best voice on this device" },
          ]} />
        </label>
        <button type="button" onClick={() => {
          const next = !muted;
          mutedRef.current = next;
          setMuted(next);
          if (next) skip();
        }}>{muted ? "Unmute" : "Mute"}</button>
        <button type="button" onClick={skip}>Skip</button>
        <button type="button" onClick={replay}>Replay</button>
        <label>Pace
          <Select className="is-compact" value={String(rate)} onChange={(value) => setRate(Number(value))} ariaLabel="Voice pace" options={[
            { value: "0.82", label: "Ceremonial" },
            { value: "0.95", label: "Measured" },
            { value: "1.08", label: "Urgent" },
          ]} />
        </label>
        {engine === "device" && <details><summary>Assign local voices</summary><div>{players.map((player, index) => (
          <label key={player.seat_id}>{player.name}<Select value={assignments[player.seat_id] ?? rankedVoices[index % Math.max(rankedVoices.length, 1)]?.name ?? ""} onChange={(value) => saveAssignment(player.seat_id, value)} ariaLabel={`${player.name} local voice`} options={rankedVoices.map((voice) => ({ value: voice.name, label: voice.name, sublabel: voice.lang }))} /></label>
        ))}</div></details>}
      </>}
    </section>
  );
}
