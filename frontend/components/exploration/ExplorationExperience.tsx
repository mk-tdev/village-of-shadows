"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createVillage, type SceneSnapshot, type VillageScene } from "@/lib/exploration/scene";
import { VillageAudio } from "@/lib/exploration/audio";
import { LANDMARKS, SPAWN, restoreSeals, type Landmark } from "@/lib/exploration/world";
import { ENCOUNTER_COPY, encounterActive, type EncounterPhase } from "@/lib/exploration/encounter";
import styles from "./exploration.module.css";

type Mode = "intro" | "playing" | "paused" | "journal" | "clue" | "complete" | "restart" | "caught";
const STORAGE_KEY = "village:prologue:seals:v1";
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function LanternIcon() {
  return <svg width="26" height="38" viewBox="0 0 26 38" fill="none" aria-hidden="true"><path d="M9 8V5a4 4 0 0 1 8 0v3M6 11h14M7 11l-3 19h18l-3-19M7 34h12M9 14l-2 13h12l-2-13M10 8h6" stroke="currentColor" strokeWidth="1.1"/><path d="M13 18c-5 6-1 8 0 8s5-2 0-8Z" fill="currentColor"/></svg>;
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={styles.modal} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function readSavedSeals() {
  try { return restoreSeals(localStorage.getItem(STORAGE_KEY)); } catch { return []; }
}

export default function ExplorationExperience() {
  const router = useRouter();
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
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [encounter, setEncounter] = useState<EncounterPhase>("waiting");
  const [witnessed, setWitnessed] = useState(false);
  const [snapshot, setSnapshot] = useState<SceneSnapshot>({ point: SPAWN, bearing: 0, nearby: null, council: false, moving: false, encounter: "waiting", ward: 0 });
  const playing = mode === "playing";
  const target = LANDMARKS.find(l => l.id === snapshot.nearby);
  const objectiveHint = snapshot.point.z > -22 ? "Follow the lamps north, past the well and chapel. The council fire is your destination." : "Find the empty wooden chair on this side of the fire. Press E to finish the intro, then choose your players and models.";
  const bearing = DIRECTIONS[Math.round(snapshot.bearing / 45) % 8];
  const location = snapshot.point.z > 7 ? "The village threshold" : snapshot.point.z > -12 ? "The old well" : snapshot.point.z > -28 ? "The silent chapel" : "The council clearing";

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
    const landmark = LANDMARKS.find(l => l.id === snapshot.nearby);
    if (!landmark || found.includes(landmark.id)) return;
    const updated = [...found, landmark.id];
    setFound(updated); setClue(landmark); setMode("clue");
    audioRef.current?.discovery();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch { setStorageBlocked(true); setNotice("Your journal will be kept for this visit."); }
  }, [found, mode, snapshot.council, snapshot.nearby, takeSeat]);

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
          if (action === "journal") setMode("journal");
          if (action === "pause") setMode("paused");
          if (action === "lantern") setLantern(value => !value);
        },
        step: running => audioRef.current?.step(running),
        spatial: (player, yaw, wolf) => audioRef.current?.spatial(player, yaw, wolf),
        omen: () => { audioRef.current?.whisper(); audioRef.current?.bell(); setNotice("You are certain someone was standing there."); },
        encounter: phase => {
          setEncounter(phase); setNotice("");
          audioRef.current?.creature(phase);
          if (phase === "aftermath") setWitnessed(true);
          if (phase === "caught") setMode("caught");
        },
        error: () => setFailed(true),
      });
      sceneRef.current = scene;
      return () => { scene?.dispose(); sceneRef.current = null; audioRef.current?.dispose(); };
    } catch {
      const frame = requestAnimationFrame(() => setFailed(true));
      return () => { cancelAnimationFrame(frame); scene?.dispose(); audioRef.current?.dispose(); };
    }
  }, []);

  useEffect(() => {
    sceneRef.current?.configure({ playing: playing && !failed, lantern, reducedMotion, brightness, found });
    audioRef.current?.setActive(playing && sound && !failed);
  }, [playing, lantern, reducedMotion, brightness, found, sound, failed]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function enter() {
    if (sound) {
      try { await audioRef.current?.start(); }
      catch { setSound(false); setNotice("Audio is unavailable. You can still explore in silence."); }
    }
    setMode("playing"); canvasRef.current?.focus();
  }

  function resume() { setMode("playing"); canvasRef.current?.focus(); }

  async function toggleSound() {
    const next = !sound;
    if (next) {
      try { await audioRef.current?.start(); }
      catch { setNotice("This browser could not start audio."); return; }
    }
    setSound(next);
  }

  function restart() {
    setFound([]); setClue(null); setNotice(""); setLantern(true); setWitnessed(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* In-memory reset still works. */ }
    sceneRef.current?.reset(); resume();
  }

  return <main className={styles.experience} data-mode={mode} data-reduced-motion={reducedMotion} data-encounter={encounter}>
    <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Explore the village. W A S D to walk, arrow left and right to turn, E to examine, F for lantern, J for journal. Drag to look or click nearby ground to walk." />
    <div className={styles.vignette} aria-hidden="true" /><div className={styles.grain} aria-hidden="true" />
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>Village of Shadows<span>The last light</span></Link>
      {mode !== "intro" && <div className={styles.compass} aria-label={`Facing ${bearing}`}><span>· · · ─────</span><b>{bearing}</b><span>───── · · ·</span><i>◆</i></div>}
      <nav aria-label="Exploration controls" className={styles.topControls}>
        <button onClick={toggleSound} aria-pressed={sound}>{sound ? "Sound on" : "Sound off"}</button>
        {mode !== "intro" && <button onClick={() => setMode("paused")}>Pause <kbd>Esc</kbd></button>}
      </nav>
    </header>
    {failed ? <section className={styles.intro}>
      <h1>The mist<br />won’t lift.</h1><p>Your browser could not keep the 3D village running. Reload to try again, or enter the council directly.</p>
      <button className={styles.primary} onClick={() => window.location.reload()}>Try again <span>↻</span></button><Link className={styles.textLink} href="/setup">Enter the AI council →</Link>
    </section> : mode === "intro" ? <>
      <section className={styles.intro}>
        <h1>Someone here<br />isn’t <em>human.</em></h1>
        <p>The lamps are still burning. The doors are all locked.<br className={styles.desktopBreak} /> And somewhere in the village, a bell is ringing.</p>
        <p className={styles.premise}>Find the council. Take your seat.<br />Keep your lantern close. Something hunts here.</p>
        <button className={styles.primary} onClick={enter} disabled={!ready}>{!ready ? "Lighting the lanterns…" : found.length ? "Continue the night" : "Enter the village"}<span>→</span></button>
        <Link href="/setup" className={styles.textLink}>Go straight to player setup <span>↗</span></Link>
      </section>
      <footer className={styles.introFooter}><span><LanternIcon /> A playable horror prologue</span><span>Headphones recommended <i /> Take your time. Listen carefully.</span></footer>
    </> : <>
      <div className={styles.crosshair} aria-hidden="true">+</div>
      {encounterActive(encounter) && <aside className={styles.encounter} role="status" aria-live="polite">
        <span>The watchman’s hunger</span><h2>{ENCOUNTER_COPY[encounter].title}</h2><p>{ENCOUNTER_COPY[encounter].text}</p>
        {encounter === "hunting" && <div className={styles.ward}><span>{snapshot.ward > 0 ? "Hold the light on it" : "Face the creature · keep the lantern lit"}</span><meter min="0" max="1" value={snapshot.ward} aria-label="Lantern protection" /></div>}
      </aside>}
      <aside className={styles.objective} aria-label="Current objective">
        <span className={styles.location}>{location}</span>
        <h1>{snapshot.council ? "Take the empty chair" : "Find the council fire"}</h1>
        <div className={styles.sealProgress}><span>{found.length} / 3 optional discoveries</span><span aria-hidden="true">{LANDMARKS.map(l => <i key={l.id} className={found.includes(l.id) ? styles.collected : ""}>•</i>)}</span></div>
        <p>{objectiveHint}</p>
        <button className={styles.journalButton} onClick={() => setMode("journal")}>Open journal <kbd>J</kbd></button>
      </aside>
      <div className={styles.interaction}>
        {playing && (target || snapshot.council) ? <button onClick={interact} className={styles.interactButton}><kbd>E</kbd>{snapshot.council ? "Sit down & choose players" : `Examine ${target?.id === "lantern" ? "the lantern" : target?.id === "well" ? "the old well" : "the chapel door"}`}</button> : <span className={styles.walkHint}>W A S D to walk <i /> Drag to look <i /> Click ground to walk</span>}
      </div>
      <div className={styles.lanternControl}><button onClick={() => setLantern(value => !value)} aria-pressed={lantern}><LanternIcon /><span>Lantern {lantern ? "lit" : "unlit"}</span><kbd>F</kbd></button></div>
      <div className={styles.movePad} aria-label="Movement controls"><button aria-label="Walk forward" onClick={() => sceneRef.current?.step("forward")}>↑</button><button aria-label="Turn left" onClick={() => sceneRef.current?.step("left")}>↶</button><button aria-label="Walk backward" onClick={() => sceneRef.current?.step("back")}>↓</button><button aria-label="Turn right" onClick={() => sceneRef.current?.step("right")}>↷</button></div>
    </>}
    <div className={styles.notice} role="status">{notice}</div>

    {!failed && mode === "paused" && <Modal title="Night paused" onClose={resume}>
      <span className={styles.chapter}>Take a breath</span><h2>The night can wait.</h2><p>You are safe here. The village is paused.</p>
      <div className={styles.settings}>
        <label>Lantern light <input type="checkbox" checked={lantern} onChange={e => setLantern(e.target.checked)} /></label>
        <label>Sound <input type="checkbox" checked={sound} onChange={toggleSound} /></label>
        <label>Reduced motion <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /></label>
        <label htmlFor="brightness">Brightness <span>{Math.round(brightness * 100)}%</span></label><input id="brightness" type="range" min="0.7" max="1.8" step="0.1" value={brightness} onChange={e => setBrightness(Number(e.target.value))} />
      </div>
      <div className={styles.controlGuide}><p><kbd>W A S D</kbd> Walk <kbd>Shift</kbd> Hurry</p><p><kbd>← →</kbd> Turn <kbd>E</kbd> Examine</p><p><kbd>F</kbd> Lantern <kbd>J</kbd> Journal</p><p>Drag to look. Click nearby ground to walk. On touch screens, use the arrows.</p></div>
      <button className={styles.primary} autoFocus onClick={resume}>Return to the village <span>→</span></button>
      <div className={styles.modalLinks}><button onClick={async () => { resume(); try { await sceneRef.current?.lockPointer(); } catch { setNotice("Mouse capture is unavailable. Drag to look instead."); } }}>Use captured mouse</button><button onClick={() => setMode("restart")}>Start again</button><Link href="/">Leave village</Link></div>
    </Modal>}

    {!failed && mode === "journal" && <Modal title="Your journal" onClose={resume}>
      <span className={styles.chapter}>Things worth remembering</span><h2>A record of the night.</h2><p>{found.length} of 3 optional keepsakes discovered. {storageBlocked ? "Your discoveries are kept for this visit; device storage is unavailable." : "Your discoveries are saved on this device."}</p>
      <ol className={styles.journalList}>{LANDMARKS.map((l, i) => <li key={l.id} data-found={found.includes(l.id)}><span>0{i + 1}</span><div><h3>{found.includes(l.id) ? l.seal : "An unwritten page"}</h3><p>{found.includes(l.id) ? l.text : i === 0 ? "A light left burning at the village entrance." : i === 1 ? "Something waits beside the old well." : "The chapel keeps the final secret."}</p></div></li>)}</ol>
      {witnessed && <section className={styles.witness}><span className={styles.chapter}>Witness account · this visit</span><h3>{ENCOUNTER_COPY.aftermath.title}</h3><p>{ENCOUNTER_COPY.aftermath.text}</p></section>}
      <button className={styles.primary} autoFocus onClick={resume}>Close journal <span>→</span></button>
    </Modal>}

    {!failed && mode === "clue" && clue && <Modal title={clue.name} onClose={resume}>
      <span className={styles.chapter}>A keepsake discovered · {found.length} of 3</span><h2>{clue.name}.</h2><p className={styles.story}>{clue.text}</p><p className={styles.clueHint}>{objectiveHint}</p><button className={styles.primary} autoFocus onClick={resume}>Keep moving <span>→</span></button>
    </Modal>}

    {!failed && mode === "complete" && <Modal title="Intro complete" onClose={() => {}}>
      <span className={styles.chapter}>You found the council</span>
      <h2>Your story starts here.</h2>
      <p>The intro is complete. Choose each player and their AI model before starting the council.</p>
      <p role="status">Taking your seat and opening player setup…</p>
      <Link className={styles.primary} href="/setup">Choose players &amp; models <span>→</span></Link>
    </Modal>}

    {!failed && mode === "restart" && <Modal title="Restart the prologue" onClose={() => setMode("paused")}><h2>Walk into the night again?</h2><p>This clears the three optional discoveries from your local journal and returns you to the entrance.</p><button className={styles.primary} onClick={restart}>Begin again <span>↻</span></button><button className={styles.textLink} autoFocus onClick={() => setMode("paused")}>Keep my discoveries</button></Modal>}
    {!failed && mode === "caught" && <Modal title="The creature found you" onClose={() => { sceneRef.current?.retryEncounter(); setLantern(true); resume(); }}>
      <span className={styles.chapter}>The watchman’s hunger</span><h2>{ENCOUNTER_COPY.caught.title}</h2><p>{ENCOUNTER_COPY.caught.text}</p><p>Keep the creature in front of you with your lantern lit until it retreats. You can also run: hold Shift while walking.</p><button className={styles.primary} autoFocus onClick={() => { sceneRef.current?.retryEncounter(); setLantern(true); resume(); }}>Return to the lane <span>↻</span></button><Link className={styles.textLink} href="/setup">Escape to the council →</Link>
    </Modal>}
  </main>;
}
