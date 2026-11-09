"use client";

import { usePreferences } from "../Preferences";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createVillage, type SceneSnapshot, type VillageScene } from "@/lib/exploration/scene";
import { VillageAudio } from "@/lib/exploration/audio";
import { TRAVELLERS, type CameraView, type TravellerName } from "@/lib/exploration/traveller";
import { LANDMARKS, SPAWN, STREETS, COUNCIL, BOUNDS, forestHint, restoreSeals, type Landmark } from "@/lib/exploration/world";
import { ENCOUNTER_COPY, encounterActive, type EncounterPhase } from "@/lib/exploration/encounter";
import type { AbbeyCue } from "@/lib/exploration/abbey";

const ABBEY_NOTICES: Partial<Record<AbbeyCue, string>> = {
  crows: "Crows burst from the headstones and wheel toward the abbey.",
  bell: "A grave bell rings once. Its cord runs down into the soil.",
  rope: "Behind you, the rope at the gate is swinging empty.",
  vanish: "Your light found her, and she was gone.",
  ring: "The bell speaks for the first time in years. Out in the cemetery, every grave answers.",
};
const ABBEY_COPY = {
  tolling: { title: "Every grave is ringing.", text: "Something is coming up the stair." },
  hunting: { title: "The Keeper has come for her voice.", text: "Face her with your lantern lit until she breaks. Do not let her reach you in the dark." },
  witness: { title: "The last bell", text: "I rang the bell, and the graves rang back. A sister in black came up the stair carrying a lantern no flame had lit. When my light held her, she came apart into crows. The rope at the gate is still swinging." },
};
import styles from "./exploration.module.css";

type Mode = "intro" | "playing" | "paused" | "journal" | "clue" | "complete" | "restart" | "caught" | "abbeyCaught" | "traveller";
const STORAGE_KEY = "village:prologue:seals:v1";
const DAYTIME_KEY = "village:explore:daytime";
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function LanternIcon() {
  return <svg width="26" height="38" viewBox="0 0 26 38" fill="none" aria-hidden="true"><path d="M9 8V5a4 4 0 0 1 8 0v3M6 11h14M7 11l-3 19h18l-3-19M7 34h12M9 14l-2 13h12l-2-13M10 8h6" stroke="currentColor" strokeWidth="1.1"/><path d="M13 18c-5 6-1 8 0 8s5-2 0-8Z" fill="currentColor"/></svg>;
}

function Modal({ children, onClose, title, focusTop = false }: { children: ReactNode; onClose: () => void; title: string; focusTop?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    if (dialog && focusTop) { dialog.focus(); dialog.scrollTop = 0; }
    return () => dialog?.close();
  }, [focusTop]);
  return <dialog ref={ref} tabIndex={-1} className={styles.modal} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function readDaytime() {
  try { return localStorage.getItem(DAYTIME_KEY) === "day"; } catch { return false; }
}

function readSavedSeals() {
  try { return restoreSeals(localStorage.getItem(STORAGE_KEY)); } catch { return []; }
}

export default function ExplorationExperience() {
  const router = useRouter();
  const { t } = usePreferences();
  const launchLock = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const audioRef = useRef<VillageAudio | null>(null);
  const [mode, setMode] = useState<Mode>("intro");
  const [found, setFound] = useState<string[]>(readSavedSeals);
  const [clue, setClue] = useState<Landmark | null>(null);
  const [sound, setSound] = useState(true);
  const [lantern, setLantern] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [brightness, setBrightness] = useState(1);
  const [view, setView] = useState<CameraView>("first");
  const [traveller, setTraveller] = useState<TravellerName>("woodsman_man");
  const [running, setRunning] = useState(false);
  const [daytime, setDaytime] = useState(readDaytime);
  const travellerReturn = useRef<"intro" | "paused">("intro");
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [encounter, setEncounter] = useState<EncounterPhase>("waiting");
  const [witnessed, setWitnessed] = useState(false);
  const [abbeyWitnessed, setAbbeyWitnessed] = useState(false);
  const [snapshot, setSnapshot] = useState<SceneSnapshot>({ point: SPAWN, bearing: 0, nearby: null, council: false, moving: false, encounter: "waiting", ward: 0, district: "The village threshold", villager: null, loading: 0, abbey: { phase: "dormant", ward: 0, bell: null } });
  const playing = mode === "playing";
  const target = LANDMARKS.find(l => l.id === snapshot.nearby);
  const objectiveHint = snapshot.point.z < -43 ? forestHint(snapshot.point, found) : snapshot.point.z > -22 ? "Follow the lamps north, past the well and chapel. The forest beyond the council is yours to explore." : "Take the empty chair by the fire to choose your players, or continue north through the broken gate into the forest.";
  const bearing = DIRECTIONS[Math.round(snapshot.bearing / 45) % 8];
  const location = snapshot.district;

  const takeSeat = useCallback(async () => {
    if (launchLock.current) return;
    launchLock.current = true;
    setMode("complete");
    try {
      await sceneRef.current?.sit();
      router.push("/setup");
    } catch {
      launchLock.current = false;
      setMode("playing");
      setNotice("Move closer to the empty chair and try again.");
    }
  }, [router]);

  const interact = useCallback(() => {
    if (mode !== "playing") return;
    if (snapshot.council) { void takeSeat(); return; }
    if (snapshot.abbey.bell && !snapshot.nearby) {
      if (snapshot.abbey.bell === "ring") sceneRef.current?.ringBell();
      else setNotice("The bell hangs silent. Its iron tongue was torn out, and someone hid it.");
      return;
    }
    if (snapshot.villager && !snapshot.nearby) { audioRef.current?.speak(); setNotice(`${snapshot.villager.name[0].toUpperCase()}${snapshot.villager.name.slice(1)}: ${snapshot.villager.line}`); return; }
    const landmark = LANDMARKS.find(l => l.id === snapshot.nearby);
    if (!landmark || found.includes(landmark.id)) return;
    const updated = [...found, landmark.id];
    setFound(updated); setClue(landmark); setMode("clue");
    audioRef.current?.discovery();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch { setStorageBlocked(true); setNotice("Your journal will be kept for this visit."); }
  }, [found, mode, snapshot.council, snapshot.nearby, snapshot.villager, snapshot.abbey.bell, takeSeat]);

  const actions = useRef({ interact, playing });
  useEffect(() => { actions.current = { interact, playing }; }, [interact, playing]);

  useEffect(() => {
    if (!canvasRef.current) return;
    audioRef.current = new VillageAudio();
    let scene: VillageScene | null = null;
    try {
      scene = createVillage(canvasRef.current, {
        ready: () => setReady(true),
        snapshot: setSnapshot,
        action: action => {
          if (!actions.current.playing) return;
          if (action === "interact") actions.current.interact();
          if (action === "journal") { audioRef.current?.journal(); setMode("journal"); }
          if (action === "pause") setMode("paused");
          if (action === "lantern") setLantern(value => !value);
          if (action === "view") setView(value => value === "first" ? "third" : "first");
        },
        step: (running, surface) => audioRef.current?.step(running, surface),
        thunder: (delay, strength) => audioRef.current?.thunder(delay, strength),
        spatial: (player, yaw, wolf) => audioRef.current?.spatial(player, yaw, wolf),
        abbey: (cue, source) => {
          audioRef.current?.abbey(cue, source);
          const line = ABBEY_NOTICES[cue];
          if (line) setNotice(line);
          if (cue === "banished") { setAbbeyWitnessed(true); setNotice("She came apart into crows. The abbey is quiet. Your journal holds what you saw."); }
          if (cue === "caught") setMode("abbeyCaught");
        },
        omen: () => { audioRef.current?.whisper(); audioRef.current?.bell(); setNotice("You are certain someone was standing there."); },
        encounter: phase => {
          setEncounter(phase); setNotice("");
          audioRef.current?.creature(phase);
          if (phase === "aftermath") setWitnessed(true);
          if (phase === "caught") setMode("caught");
        },
        error: () => setFailed(true),
        avatarError: () => { setView("first"); setNotice("Your traveller could not load. First-person exploration is still available; choose a traveller to try again."); },
      });
      sceneRef.current = scene;
      return () => { scene?.dispose(); sceneRef.current = null; audioRef.current?.dispose(); };
    } catch {
      const frame = requestAnimationFrame(() => setFailed(true));
      return () => { cancelAnimationFrame(frame); scene?.dispose(); audioRef.current?.dispose(); };
    }
  }, []);

  useEffect(() => {
    sceneRef.current?.configure({ playing: playing && !failed, lantern, reducedMotion, brightness, found, view, traveller, running, daytime });
    audioRef.current?.setDaytime(daytime);
    audioRef.current?.setActive(playing && sound && !failed);
  }, [playing, lantern, reducedMotion, brightness, found, sound, failed, view, traveller, running, daytime]);

  const lanternWas = useRef(lantern);
  useEffect(() => {
    if (lanternWas.current !== lantern && playing) audioRef.current?.lantern(lantern);
    lanternWas.current = lantern;
  }, [lantern, playing]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 9000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function enter(atAbbey = false) {
    if (atAbbey) sceneRef.current?.startAtAbbey();
    if (sound) {
      try { await audioRef.current?.start(); }
      catch { setSound(false); setNotice("Audio is unavailable. You can still explore in silence."); }
    }
    setMode("playing"); canvasRef.current?.focus();
  }

  function resume() { setMode("playing"); canvasRef.current?.focus(); }
  function chooseTraveller(from: "intro" | "paused") { travellerReturn.current = from; setMode("traveller"); }

  async function toggleSound() {
    const next = !sound;
    if (next) {
      try { await audioRef.current?.start(); }
      catch { setNotice("This browser could not start audio."); return; }
    }
    setSound(next);
  }

  function toggleDaytime() {
    const next = !daytime;
    setDaytime(next);
    try { localStorage.setItem(DAYTIME_KEY, next ? "day" : "night"); } catch { /* Applies for this visit only. */ }
    canvasRef.current?.focus();
  }

  function restart() {
    setFound([]); setClue(null); setNotice(""); setLantern(true); setWitnessed(false); setAbbeyWitnessed(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* In-memory reset still works. */ }
    sceneRef.current?.reset(); resume();
  }

  return <main className={styles.experience} data-mode={mode} data-reduced-motion={reducedMotion} data-daytime={daytime} data-encounter={snapshot.abbey.phase === "hunting" ? "hunting" : encounter}
    onContextMenuCapture={event => { if (event.target instanceof Element && event.target.closest("button")) event.preventDefault(); }}
    onDragStartCapture={event => { if (event.target instanceof Element && event.target.closest("button")) event.preventDefault(); }}>
    <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Explore the village. W A S D to walk, Shift to run, Space to jump, V to switch camera, arrow left and right to turn, E to examine, F for lantern, J for journal. Drag to look or click nearby ground to walk." />
    <div className={styles.vignette} aria-hidden="true" /><div className={styles.grain} aria-hidden="true" />
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>{t("Village of Shadows")}<span>{t("The last light")}</span></Link>
      {mode !== "intro" && <div className={styles.compass} aria-label={`Facing ${bearing}`}><span>· · · ─────</span><b>{bearing}</b><span>───── · · ·</span><i>◆</i></div>}
      <nav aria-label="Exploration controls" className={styles.topControls}>
        <button onClick={toggleDaytime} role="switch" aria-checked={daytime} aria-label="Daytime" title={daytime ? "Switch to night" : "Switch to day"}><span aria-hidden="true">{daytime ? "☀" : "☾"}</span> {daytime ? "Day" : "Night"}</button>
        <button onClick={toggleSound} aria-pressed={sound}>{sound ? t("Sound on") : t("Sound off")}</button>
        {mode !== "intro" && <button onClick={() => setMode("paused")}>{t("Pause")} <kbd>Esc</kbd></button>}
      </nav>
    </header>
    {failed ? <section className={styles.intro}>
      <h1>The mist<br />won’t lift.</h1><p>Your browser could not keep the 3D village running. Reload to try again, or enter the council directly.</p>
      <button className={styles.primary} onClick={() => window.location.reload()}>Try again <span>↻</span></button><Link className={styles.textLink} href="/setup">Enter the AI council →</Link>
    </section> : mode === "intro" ? <>
      <section className={styles.intro}>
        <h1>Someone here<br />isn’t <em>human.</em></h1>
        <p>Beyond the last lantern: a temple without worshippers,<br className={styles.desktopBreak} /> houses without voices, and water that whispers your name.</p>
        <p className={styles.premise}>{t("Find the council. Take your seat.")}<br />{t("Keep your lantern close. Something hunts here.")}</p>
        <div className={styles.entryRoutes}>
          <button className={styles.primary} onClick={() => enter()} disabled={!ready}>{!ready ? `Lighting the lanterns… ${Math.round(snapshot.loading * 100)}%` : found.length ? t("Continue the night") : t("Enter the village")}<span>→</span></button>
          <button className={styles.abbeyLink} onClick={() => enter(true)} disabled={!ready}>Take me to the abbey <span aria-hidden="true">↗</span></button>
        </div>
        <button className={styles.travellerLink} onClick={() => chooseTraveller("intro")}>Choose your traveller <span>Optional · free presets</span></button>
        <Link href="/setup" className={styles.textLink}>{t("Go straight to player setup")} <span>↗</span></Link>
      </section>
      <footer className={styles.introFooter}><span><LanternIcon /> A playable horror prologue</span><span>Headphones recommended <i /> Take your time. Listen carefully.</span></footer>
    </> : <>
      <div className={styles.crosshair} aria-hidden="true">+</div>
      {encounterActive(encounter) && <aside className={styles.encounter} role="status" aria-live="polite">
        <span>The watchman’s hunger</span><h2>{ENCOUNTER_COPY[encounter].title}</h2><p>{ENCOUNTER_COPY[encounter].text}</p>
        {encounter === "hunting" && <div className={styles.ward}><span>{snapshot.ward > 0 ? "Hold the light on it" : "Face the creature · keep the lantern lit"}</span><meter min="0" max="1" value={snapshot.ward} aria-label="Lantern protection" /></div>}
      </aside>}
      {(snapshot.abbey.phase === "tolling" || snapshot.abbey.phase === "hunting") && <aside className={styles.encounter} role="status" aria-live="polite">
        <span>The Abbey of the Last Bell</span><h2>{ABBEY_COPY[snapshot.abbey.phase].title}</h2><p>{ABBEY_COPY[snapshot.abbey.phase].text}</p>
        {snapshot.abbey.phase === "hunting" && <div className={styles.ward}><span>{snapshot.abbey.ward > 0 ? "Hold the light on her" : "Face her · keep the lantern lit"}</span><meter min="0" max="1" value={snapshot.abbey.ward} aria-label="Lantern protection" /></div>}
      </aside>}
      <aside className={styles.objective} aria-label="Current objective">
        <span className={styles.location}>{t(location)}</span>
        <h1>{snapshot.council ? t("Take the empty chair") : snapshot.point.z < -43 ? "Beyond the last lantern" : t("Find the council fire")}</h1>
        <div className={styles.sealProgress}><span>{found.length} / {LANDMARKS.length} discoveries</span><span aria-hidden="true">{LANDMARKS.map(l => <i key={l.id} className={found.includes(l.id) ? styles.collected : ""}>•</i>)}</span></div>
        <p>{t(objectiveHint)}</p>
        <button className={styles.journalButton} onClick={() => setMode("journal")}>Map & journal <kbd>J</kbd></button>
      </aside>
      <div className={styles.interaction}>
        {playing && (target || snapshot.council || snapshot.villager || snapshot.abbey.bell) ? <button onClick={interact} className={styles.interactButton}><kbd>E</kbd>{snapshot.council ? t("Sit down & choose players") : target ? `Examine ${target.name.toLowerCase()}` : snapshot.abbey.bell === "ring" ? "Restore the clapper & ring the bell" : snapshot.abbey.bell === "silent" ? "Examine the silent bell" : `Speak with ${snapshot.villager?.name}`}</button> : <span className={styles.walkHint}>W A S D · walk <i /> Shift · run <i /> Space · jump <i /> Drag · look</span>}
      </div>
      <div className={styles.lanternControl}><button onClick={() => setLantern(value => !value)} aria-pressed={lantern}><LanternIcon /><span>Lantern {lantern ? "lit" : "unlit"}</span><kbd>F</kbd></button></div>
      <div className={styles.travelControls} aria-label="Traveller controls">
        <button disabled={!playing} onClick={() => setView(v => v === "first" ? "third" : "first")}>{view === "first" ? "Third-person view" : "First-person view"} <kbd>V</kbd></button>
        <div><button disabled={!playing} aria-pressed={running} onClick={() => setRunning(v => !v)}>{running ? "Running" : "Run"}</button><button disabled={!playing} onClick={() => sceneRef.current?.jump()}>Jump <kbd>Space</kbd></button></div>
      </div>
      <div className={styles.movePad} aria-label="Movement controls">{([ ["forward", "Walk forward", "↑"], ["left", "Turn left", "↶"], ["back", "Walk backward", "↓"], ["right", "Turn right", "↷"] ] as const).map(([direction, label, symbol]) => <button key={direction} disabled={!playing} aria-label={label}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); sceneRef.current?.hold(direction, true); }}
        onPointerUp={() => sceneRef.current?.hold(direction, false)} onPointerCancel={() => sceneRef.current?.hold(direction, false)} onLostPointerCapture={() => sceneRef.current?.hold(direction, false)}
        onClick={event => { if (event.detail === 0) sceneRef.current?.step(direction); }}>{symbol}</button>)}</div>
    </>}
    <div className={styles.notice} role="status">{notice}</div>

    {!failed && mode === "traveller" && <Modal title="Choose your traveller" onClose={() => setMode(travellerReturn.current)}>
      <span className={styles.chapter}>A face in the mist</span><h2>Who walks tonight?</h2>
      <p>Choose an animated village traveller. No photo, account or generation fee. You can switch back to first-person at any time.</p>
      <div className={styles.travellerGrid} role="group" aria-label="Free traveller presets">{TRAVELLERS.map((item, index) => <button key={item.id} aria-pressed={traveller === item.id} onClick={() => { setTraveller(item.id); setView("third"); }}><span className={styles.travellerNumber}>0{index + 1} {traveller === item.id ? "· Selected" : ""}</span><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
      <button className={styles.primary} onClick={() => { setView("third"); setMode(travellerReturn.current); }}>Use this traveller <span>→</span></button>
      <div className={styles.modalLinks}><button onClick={() => { setView("first"); setMode(travellerReturn.current); }}>Stay in first-person</button></div>
    </Modal>}

    {!failed && mode === "paused" && <Modal title="Night paused" onClose={resume}>
      <span className={styles.chapter}>Take a breath</span><h2>The night can wait.</h2><p>You are safe here. The village is paused.</p>
      <div className={styles.settings}>
        <label>Lantern light <input type="checkbox" checked={lantern} onChange={e => setLantern(e.target.checked)} /></label>
        <label>Sound <input type="checkbox" checked={sound} onChange={toggleSound} /></label>
        <label>Daytime <input type="checkbox" checked={daytime} onChange={toggleDaytime} /></label>
        <label>Reduced motion <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /></label>
        <label htmlFor="brightness">Brightness <span>{Math.round(brightness * 100)}%</span></label><input id="brightness" type="range" min="0.7" max="1.8" step="0.1" value={brightness} onChange={e => setBrightness(Number(e.target.value))} />
      </div>
      <button className={styles.travellerLink} onClick={() => chooseTraveller("paused")}>Choose your traveller <span>{TRAVELLERS.find(item => item.id === traveller)?.name}</span></button>
      <div className={styles.controlGuide}><p><kbd>W A S D</kbd> Walk <kbd>Shift</kbd> Run</p><p><kbd>Space</kbd> Jump <kbd>V</kbd> Camera view</p><p><kbd>← →</kbd> Turn <kbd>E</kbd> Examine</p><p><kbd>F</kbd> Lantern <kbd>J</kbd> Journal</p><p>Drag to look. Jump over low fences, crates and street barriers. Buildings and water remain impassable. On touch screens, hold the arrows and use Run / Jump.</p></div>
      <button className={styles.primary} autoFocus onClick={resume}>Return to the village <span>→</span></button>
      <div className={styles.modalLinks}><button onClick={async () => { resume(); try { await sceneRef.current?.lockPointer(); } catch { setNotice("Mouse capture is unavailable. Drag to look instead."); } }}>Use captured mouse</button><button onClick={() => setMode("restart")}>Start again</button><Link href="/">Leave village</Link></div>
    </Modal>}

    {!failed && mode === "journal" && <Modal title="Your journal" onClose={resume} focusTop>
      <span className={styles.chapter}>Things worth remembering</span><h2>A record of the night.</h2><p>{found.length} of {LANDMARKS.length} optional keepsakes discovered. {storageBlocked ? "Your discoveries are kept for this visit; device storage is unavailable." : "Your discoveries are saved on this device."}</p>
      <figure className={styles.trailMap}>
        <svg viewBox={`${BOUNDS.minX - 5} ${BOUNDS.minZ - 8} ${BOUNDS.maxX - BOUNDS.minX + 10} ${BOUNDS.maxZ - BOUNDS.minZ + 16}`} role="img" aria-label="Trail map: temple and abbey northwest, abandoned houses northeast, waterfall east. Your position is the white arrow. The council is south of the forest gate.">
          <text x="-66" y={BOUNDS.minZ + 4} className={styles.mapNorth}>N ↑</text>
          <rect x="-68" y="-134" width="52" height="33.5" fill="none" stroke="#857356" strokeWidth=".6" strokeDasharray="1.5 1" />
          <text x="-40" y="-110">Abbey</text>
          {STREETS.map((s, i) => <polyline key={i} points={s.points.map(p => `${p.x},${p.z}`).join(" ")} fill="none" stroke="#857356" strokeWidth={s.width * .45} strokeLinecap="round" />)}
          {LANDMARKS.map(l => <g key={l.id}><circle cx={l.x} cy={l.z} r="1.8" fill={found.includes(l.id) ? "#e6b974" : "#788f85"} /><text x={l.x + 3} y={l.z - 3}>{({ lantern: "Gate", well: "Well", chapel: "Chapel", temple: "Temple", ruins: "Ruins", falls: "Falls", grave: "Graves", register: "Abbey", clapper: "Bones" } as Record<string, string>)[l.id]}</text></g>)}
          <circle cx={COUNCIL.x} cy={COUNCIL.z} r="2" fill="#eea052" /><text x={COUNCIL.x + 4} y={COUNCIL.z + 1}>Council</text>
          <path d="M0,-3 L2,2 L0,1 L-2,2 Z" transform={`translate(${snapshot.point.x} ${snapshot.point.z}) rotate(${snapshot.bearing})`} fill="#fff5df" stroke="#fff5df" strokeWidth=".5" />
        </svg>
        <figcaption>Your lantern marks your position. All discoveries are optional; the council is always your way into the game.</figcaption>
      </figure>
      <ol className={styles.journalList}>{LANDMARKS.map((l, i) => <li key={l.id} data-found={found.includes(l.id)}><span>0{i + 1}</span><div><h3>{found.includes(l.id) ? l.seal : l.name}</h3><p>{found.includes(l.id) ? l.text : l.hint}</p></div></li>)}</ol>
      {abbeyWitnessed && <section className={styles.witness}><span className={styles.chapter}>Witness account · this visit</span><h3>{ABBEY_COPY.witness.title}</h3><p>{ABBEY_COPY.witness.text}</p></section>}
      {witnessed && <section className={styles.witness}><span className={styles.chapter}>Witness account · this visit</span><h3>{ENCOUNTER_COPY.aftermath.title}</h3><p>{ENCOUNTER_COPY.aftermath.text}</p></section>}
      <button className={styles.primary} autoFocus onClick={resume}>Close journal <span>→</span></button>
    </Modal>}

    {!failed && mode === "clue" && clue && <Modal title={clue.name} onClose={resume}>
      <span className={styles.chapter}>A keepsake discovered · {found.length} of {LANDMARKS.length}</span><h2>{clue.name}.</h2><p className={styles.story}>{clue.text}</p><p className={styles.clueHint}>{t(objectiveHint)}</p><button className={styles.primary} autoFocus onClick={resume}>Keep moving <span>→</span></button>
    </Modal>}

    {!failed && mode === "complete" && <Modal title="Intro complete" onClose={() => {}}>
      <span className={styles.chapter}>{t("You found the council")}</span>
      <h2>{t("Your story starts here.")}</h2>
      <p>{t("The intro is complete. Choose each player and their AI model before starting the council.")}</p>
      <p role="status">{t("Taking your seat and opening player setup\u2026")}</p>
      <Link className={styles.primary} href="/setup">Choose players &amp; models <span>→</span></Link>
    </Modal>}

    {!failed && mode === "restart" && <Modal title="Restart the prologue" onClose={() => setMode("paused")}><h2>Walk into the night again?</h2><p>This clears the {LANDMARKS.length} optional discoveries from your local journal and returns you to the entrance.</p><button className={styles.primary} onClick={restart}>Begin again <span>↻</span></button><button className={styles.textLink} autoFocus onClick={() => setMode("paused")}>Keep my discoveries</button></Modal>}
    {!failed && mode === "abbeyCaught" && <Modal title="The Keeper reached you" onClose={() => { sceneRef.current?.retryAbbey(); setLantern(true); resume(); }}>
      <span className={styles.chapter}>The Abbey of the Last Bell</span><h2>Your light went out.</h2><p>Cold hands closed over the lantern. When you can see again you are standing in the belfry, and something is starting up the stair.</p><p>Turn to face the stair with your lantern lit and hold the light on her until she breaks.</p><button className={styles.primary} autoFocus onClick={() => { sceneRef.current?.retryAbbey(); setLantern(true); resume(); }}>Stand in the belfry again <span>↻</span></button><Link className={styles.textLink} href="/setup">Escape to the council →</Link>
    </Modal>}
    {!failed && mode === "caught" && <Modal title="The creature found you" onClose={() => { sceneRef.current?.retryEncounter(); setLantern(true); resume(); }}>
      <span className={styles.chapter}>The watchman’s hunger</span><h2>{ENCOUNTER_COPY.caught.title}</h2><p>{ENCOUNTER_COPY.caught.text}</p><p>Keep the creature in front of you with your lantern lit until it retreats. You can also run: hold Shift while walking.</p><button className={styles.primary} autoFocus onClick={() => { sceneRef.current?.retryEncounter(); setLantern(true); resume(); }}>Return to the lane <span>↻</span></button><Link className={styles.textLink} href="/setup">Escape to the council →</Link>
    </Modal>}
  </main>;
}
