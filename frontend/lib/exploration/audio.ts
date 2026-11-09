import type { Surface } from "./world";
import type { AbbeyCue } from "./abbey";
import { VILLAGE_BOUNDS, CHAPEL, COUNCIL, FALLS, TEMPLE, RUINS } from "./world";

/**
 * CC0 sound library (public/exploration/audio/PROVENANCE.md) mixed with Web
 * Audio: HRTF-positioned emitters, layered ambience beds, surface footsteps,
 * a reverb send, and adaptive music that follows the encounter. Starts only
 * on a user gesture; suspending the context freezes everything on pause.
 */
const ROOT = "/exploration/audio";
const STEPS: Record<string, number> = { stone: 5, grass: 5, wood: 5, dirt: 6, mud: 6, dirt_run: 6 };
const BEDS = ["amb/wind_trees_night", "amb/rain_light", "amb/forest_night_crickets_owl", "amb/wood_creak_trees", "amb/campfire_close", "music/explore_dark_ambience_loop", "music/tension_suspense_loop", "music/chase_drums_loop"];
const ONE_SHOTS = ["sfx/owl_hoot", "sfx/wolf_howl", "sfx/wolf_howl_distant_echo", "sfx/crow_caw", "sfx/church_bell_toll", "sfx/door_creak", "sfx/shutter_bang", "sfx/chain_rattle", "sfx/well_crank_rope", "sfx/water_drip", "sfx/match_strike_light", "sfx/candle_blow_out", "sfx/heartbeat_single", "sfx/breath_heavy", "sfx/breath_run_loop", "sfx/cloth_whoosh_1", "sfx/cloth_rustle", "sfx/paper_rustle", "sfx/item_pickup_leather", "sfx/book_page_flip", "sfx/thunder_distant", "sfx/thunder_crack_roll", "music/stinger_horror", "music/stinger_piano_shock", "attack", "growl"];

type Loop = { source: AudioBufferSourceNode; gain: GainNode; panner?: PannerNode };
type Vec = { x: number; y?: number; z: number };

export class VillageAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<"music" | "amb" | "sfx" | "creature" | "reverb", GainNode> | null = null;
  private samples = new Map<string, AudioBuffer>();
  private loops = new Map<string, Loop>();
  private load: Promise<void> | null = null;
  private disposed = false;
  private listener = { x: 0, z: 0, yaw: 0 };
  private wolf: PannerNode | null = null;
  private tension = 0;
  private hunting = false;
  private runTime = 0;
  private lastStep = 0;
  private schedule: { at: number; play: () => void; every: [number, number] }[] = [];
  private heartbeat = 0;

  async start() {
    if (!this.context) {
      const c = new AudioContext();
      this.context = c;
      this.master = c.createGain(); this.master.gain.value = .9;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 6; limiter.attack.value = .004; limiter.release.value = .2;
      this.master.connect(limiter).connect(c.destination);
      const bus = (gain: number) => { const g = c.createGain(); g.gain.value = gain; g.connect(this.master!); return g; };
      this.buses = { music: bus(.32), amb: bus(.55), sfx: bus(.9), creature: bus(1), reverb: bus(.5) };
      // Procedural outdoor impulse: a dark, diffuse 2.4 s tail for distant one-shots and steps.
      const convolver = c.createConvolver();
      const length = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, length, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < length; i++) { lp = lp * .82 + (Math.random() * 2 - 1) * .18; d[i] = lp * Math.pow(1 - i / length, 3.2) * (i < c.sampleRate * .02 ? i / (c.sampleRate * .02) : 1); }
      }
      convolver.buffer = ir;
      this.reverbIn = c.createGain(); this.reverbIn.connect(convolver).connect(this.buses.reverb);
      // A wordless choir: detuned voices through "ah" vowel formants, heard only indoors.
      this.choir = c.createGain(); this.choir.gain.value = 0;
      const formants = [[730, 1, 6], [1090, .5, 8], [2440, .25, 10]].map(([f, g, q]) => {
        const band = c.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = f; band.Q.value = q;
        const gain = c.createGain(); gain.gain.value = g; band.connect(gain).connect(this.choir!); return band;
      });
      [146.8, 147.6, 174.6, 220, 220.9, 293.7].forEach((f, i) => {
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
        const vib = c.createOscillator(); vib.frequency.value = 4.6 + i * .3; const depth = c.createGain(); depth.gain.value = 5 + i;
        vib.connect(depth).connect(o.detune); vib.start();
        const breath = c.createOscillator(); breath.frequency.value = .07 + i * .019; const swell = c.createGain(); swell.gain.value = .015;
        const voice = c.createGain(); voice.gain.value = .022; breath.connect(swell).connect(voice.gain); breath.start();
        o.connect(voice); formants.forEach(b => voice.connect(b)); o.start();
      });
      this.choir.connect(this.buses.music); this.choir.connect(this.reverbIn);
      this.wolf = this.panner(1.5, 30); this.wolf.connect(this.buses.creature);
    }
    await this.context.resume();
    if (!this.load) {
      const c = this.context;
      const names = [...BEDS, ...ONE_SHOTS, ...Object.entries(STEPS).flatMap(([s, n]) => Array.from({ length: n }, (_, i) => `steps/${s}_${i + 1}`))];
      // Beds first so the world is audible quickly; one-shots stream in behind.
      const fetchOne = async (name: string) => {
        const response = await fetch(`${ROOT}/${name}.mp3`);
        if (!response.ok) throw new Error(`Audio asset unavailable: ${name}`);
        const buffer = await c.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) this.samples.set(name, buffer);
      };
      this.load = Promise.allSettled(BEDS.map(fetchOne)).then(() => { if (!this.disposed) this.startBeds(); void Promise.allSettled(names.filter(n => !BEDS.includes(n)).map(fetchOne)); });
    }
    await this.load;
  }

  private reverbIn: GainNode | null = null;
  private choir: GainNode | null = null;
  private abbeyHunt = false;

  private panner(ref: number, max: number) {
    const p = this.context!.createPanner();
    p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = 1.1;
    return p;
  }
  private place(p: PannerNode, at: Vec) {
    const t = this.context!.currentTime;
    p.positionX.setTargetAtTime(at.x, t, .05); p.positionY.setTargetAtTime(at.y ?? 1.2, t, .05); p.positionZ.setTargetAtTime(at.z, t, .05);
  }

  private loop(name: string, bus: GainNode, gain: number, at?: Vec, ref = 2, rate = 1) {
    const c = this.context!, buffer = this.samples.get(name);
    if (!buffer || this.loops.has(`${name}@${at?.x ?? ""}`)) return;
    const source = c.createBufferSource(); source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    let panner: PannerNode | undefined;
    if (at) { panner = this.panner(ref, 60); this.place(panner, at); source.connect(g).connect(panner).connect(bus); }
    else source.connect(g).connect(bus);
    source.start(c.currentTime, Math.random() * buffer.duration);
    this.loops.set(`${name}@${at?.x ?? ""}`, { source, gain: g, panner });
  }

  private startBeds() {
    if (!this.buses) return;
    const { amb, music } = this.buses;
    this.loop("amb/wind_trees_night", amb, .55);
    this.loop("amb/rain_light", amb, .32);
    this.loop("amb/forest_night_crickets_owl", amb, .0);
    this.loop("amb/wood_creak_trees", amb, .12);
    this.loop("amb/campfire_close", this.buses.sfx, 1.2, { x: COUNCIL.x, y: .5, z: COUNCIL.z }, 1.6);
    this.loop("amb/campfire_close", this.buses.sfx, .55, { x: 29.4, y: 1, z: -3 }, 1.2, .72); // the forge
    this.loop("amb/wood_creak_trees", this.buses.sfx, .9, { x: 23.6, y: 2.6, z: -38 }, 2, .8); // the mill wheel
    this.loop("music/explore_dark_ambience_loop", music, .8);
    this.loop("music/tension_suspense_loop", music, 0);
    this.loop("music/chase_drums_loop", music, 0);
    // A soft, filtered noise bed gives the falls a continuous, spatial roar.
    // Synthesized locally: no third-party sound request or new licensing dependency.
    const c = this.context!, water = c.createBuffer(1, c.sampleRate * 5, c.sampleRate);
    const data = water.getChannelData(0); let low = 0;
    for (let i = 0; i < data.length; i++) {
      low = low * .94 + (Math.random() * 2 - 1) * .06;
      data[i] = low * 2.5 + (Math.random() * 2 - 1) * .055;
    }
    this.samples.set("waterfall", water);
    this.loop("waterfall", amb, 0, { x: FALLS.x, y: 3, z: FALLS.z - 4 }, 8);
    this.loop("amb/wood_creak_trees", amb, .45, { ...RUINS, y: 2 }, 3, .65);
    // Ambient events, each at a fresh random interval.
    const now = this.context!.currentTime;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const edge = () => { const a = Math.random() * Math.PI * 2; return { x: this.listener.x + Math.cos(a) * 35, y: 6, z: this.listener.z + Math.sin(a) * 35 }; };
    this.schedule = [
      { at: now + rnd(16, 28), every: [28, 48], play: () => {
        if (Math.hypot(this.listener.x - TEMPLE.x, this.listener.z - TEMPLE.z) < 23)
          this.oneShot("sfx/church_bell_toll", .28, { ...TEMPLE, y: 5 }, 4, .58, undefined, .7);
      } },
      { at: now + rnd(12, 22), every: [20, 40], play: () => {
        if (Math.hypot(this.listener.x - RUINS.x, this.listener.z - RUINS.z) < 18) {
          this.oneShot("sfx/door_creak", .45, { x: RUINS.x + 6, y: 1.8, z: RUINS.z - 3 }, 3, .7);
          this.oneShot("sfx/breath_heavy", .12, { x: RUINS.x - 5, y: 1, z: RUINS.z }, 2, .65, undefined, .6, 2);
        }
      } },
      { at: now + rnd(8, 16), every: [22, 45], play: () => this.oneShot("sfx/owl_hoot", .5, edge(), 6) },
      { at: now + rnd(20, 40), every: [30, 60], play: () => this.oneShot("sfx/crow_caw", .45, { x: -24 + rnd(-6, 6), y: 6, z: -32 + rnd(-8, 8) }, 6) },
      { at: now + rnd(40, 70), every: [70, 130], play: () => this.oneShot("sfx/wolf_howl_distant_echo", .45, edge(), 20, rnd(.85, 1)) },
      { at: now + rnd(25, 50), every: [35, 80], play: () => this.oneShot(Math.random() < .5 ? "sfx/shutter_bang" : "sfx/door_creak", .7, { x: this.listener.x + rnd(-14, 14), y: 2.5, z: this.listener.z + rnd(-14, 14) }, 3) },
      { at: now + rnd(6, 12), every: [5, 11], play: () => this.oneShot("sfx/water_drip", .35, { x: 2.5, y: .3, z: -3 }, 1) },
      { at: now + rnd(60, 90), every: [80, 140], play: () => this.oneShot("sfx/church_bell_toll", .55, { x: CHAPEL.x, y: 12, z: CHAPEL.z - 2.7 }, 10) },
      { at: now + rnd(45, 90), every: [60, 120], play: () => this.oneShot("sfx/chain_rattle", .35, { x: 2.5, y: 1, z: -3 }, 1.5) },
    ];
  }

  private oneShot(name: string, gain: number, at?: Vec, ref = 2, rate = 1, bus?: GainNode, wet = .25, delay = 0) {
    const c = this.context, buffer = this.samples.get(name);
    if (!c || !buffer || !this.buses || c.state !== "running") return;
    const source = c.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    const out = bus ?? this.buses.sfx;
    let node: AudioNode = source.connect(g);
    let panner: PannerNode | null = null;
    if (at) { panner = this.panner(ref, 80); this.place(panner, at); panner.positionX.value = at.x; panner.positionY.value = at.y ?? 1.2; panner.positionZ.value = at.z; node = node.connect(panner); }
    node.connect(out);
    let send: GainNode | null = null;
    if (wet > 0 && this.reverbIn) { send = c.createGain(); send.gain.value = wet; node.connect(send).connect(this.reverbIn); }
    source.start(c.currentTime + delay);
    source.onended = () => { source.disconnect(); g.disconnect(); panner?.disconnect(); send?.disconnect(); };
  }

  setActive(active: boolean) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(active ? .9 : 0, this.context.currentTime, .12);
    if (active) void this.context.resume().catch(() => {});
    else void this.context.suspend().catch(() => {});
  }

  spatial(player: { x: number; z: number }, yaw: number, wolf: { x: number; z: number }, interior = 0) {
    const c = this.context;
    if (!c || !this.buses) return;
    const t = c.currentTime, L = c.listener;
    this.listener = { x: player.x, z: player.z, yaw };
    L.positionX.setTargetAtTime(player.x, t, .05); L.positionY.setTargetAtTime(1.65, t, .05); L.positionZ.setTargetAtTime(player.z, t, .05);
    L.forwardX.setTargetAtTime(-Math.sin(yaw), t, .05); L.forwardY.setTargetAtTime(0, t, .05); L.forwardZ.setTargetAtTime(-Math.cos(yaw), t, .05);
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    if (this.wolf) this.place(this.wolf, { x: wolf.x, y: 1.1, z: wolf.z });
    // Forest night swells near the palisade; the music bed recedes near the fire.
    const edge = Math.min(player.x - VILLAGE_BOUNDS.minX, VILLAGE_BOUNDS.maxX - player.x, player.z - VILLAGE_BOUNDS.minZ, VILLAGE_BOUNDS.maxZ - player.z);
    this.loops.get("amb/forest_night_crickets_owl@")?.gain.gain.setTargetAtTime(Math.min(.65, Math.max(.08, .6 - edge * .04)), t, 1);
    const fallsDistance = Math.hypot(player.x - FALLS.x, player.z - FALLS.z);
    this.loops.get(`waterfall@${FALLS.x}`)?.gain.gain.setTargetAtTime(Math.max(0, 1 - fallsDistance / 38) * .95, t, .8);
    const atFire = Math.hypot(player.x - COUNCIL.x, player.z - COUNCIL.z) < 9;
    this.loops.get("music/explore_dark_ambience_loop@")?.gain.gain.setTargetAtTime(this.tension > 0 ? .15 : atFire ? .35 : .8, t, 1.5);
    this.loops.get("music/tension_suspense_loop@")?.gain.gain.setTargetAtTime(this.tension > 0 && !this.hunting ? .9 : this.hunting || this.abbeyHunt ? .45 : 0, t, 1.2);
    this.loops.get("music/chase_drums_loop@")?.gain.gain.setTargetAtTime(this.hunting || this.abbeyHunt ? .9 : 0, t, .6);
    // Under stone roofs: longer reverb, muffled weather, and the sisters' choir.
    this.buses.reverb.gain.setTargetAtTime(.5 + interior * 1.1, t, .6);
    this.buses.amb.gain.setTargetAtTime(.55 * (1 - interior * .65), t, .6);
    this.choir?.gain.setTargetAtTime(interior * (this.abbeyHunt ? .05 : .32), t, 1.2);
    // Ambient scheduler and heartbeat run off the audio clock, so pause freezes them.
    for (const event of this.schedule) if (t >= event.at) { event.play(); event.at = t + event.every[0] + Math.random() * (event.every[1] - event.every[0]); }
    if ((this.hunting || this.abbeyHunt) && t >= this.heartbeat) {
      const distance = this.abbeyHunt ? 4 : Math.hypot(wolf.x - player.x, wolf.z - player.z);
      this.oneShot("sfx/heartbeat_single", .8, undefined, 1, 1, this.buses.sfx, 0);
      this.heartbeat = t + Math.max(.42, Math.min(1.1, distance / 9));
    }
    this.runTime = Math.max(0, this.runTime - .12 * .5);
  }

  step(running: boolean, surface: Surface = "stone") {
    const c = this.context;
    if (!c || !this.buses) return;
    if (running) this.runTime = Math.min(12, this.runTime + .6);
    let set = surface === "dirt" ? (running ? "dirt_run" : Math.random() < .35 ? "mud" : "dirt") : surface;
    if (!STEPS[set]) set = "stone";
    const name = `steps/${set}_${1 + Math.floor(Math.random() * STEPS[set])}`;
    const base = set === "grass" ? 1.6 : set === "mud" ? .9 : set === "stone" ? .55 : .8;
    this.oneShot(name, base * (running && set !== "dirt_run" ? 1.3 : 1), undefined, 1, (running && set !== "dirt_run" ? 1.12 : 1) * (.94 + Math.random() * .12), this.buses.sfx, .12);
    // Ragged breathing after a sustained sprint.
    if (this.runTime > 8 && c.currentTime - this.lastStep > 4) { this.lastStep = c.currentTime; this.oneShot("sfx/breath_heavy", .4, undefined, 1, 1, this.buses.sfx, 0); }
  }

  discovery() { this.oneShot("sfx/paper_rustle", .9, undefined, 1, 1, undefined, .1); this.oneShot("sfx/item_pickup_leather", .8, undefined, 1, 1, undefined, .05, .25); }
  journal() { this.oneShot("sfx/book_page_flip", 1.2, undefined, 1, 1, undefined, .05); }
  lantern(lit: boolean) { this.oneShot(lit ? "sfx/match_strike_light" : "sfx/candle_blow_out", lit ? 1.4 : .9, undefined, 1, 1, undefined, .05); }
  speak() { this.oneShot("sfx/cloth_rustle", .7, undefined, 1, 1, undefined, .05); }
  bell() { this.oneShot("sfx/church_bell_toll", .8, { x: CHAPEL.x, y: 12, z: CHAPEL.z - 2.7 }, 12, .92); }
  abbey(cue: AbbeyCue, source: { x: number; z: number }) {
    const at = { x: source.x, z: source.z, y: 1.6 };
    const music = this.buses?.music;
    if (cue === "crows") { this.oneShot("sfx/crow_caw", .6, { ...at, y: 2 }, 5); this.oneShot("sfx/crow_caw", .4, { ...at, x: at.x + 3, y: 3 }, 5, 1.15, undefined, .3, .35); this.oneShot("sfx/cloth_whoosh_1", .4, at, 4, 1.4); }
    if (cue === "bell") this.oneShot("sfx/church_bell_toll", .32, at, 2.5, 2.1, undefined, .4);
    if (cue === "rope") { this.oneShot("sfx/chain_rattle", .5, { ...at, y: 5.5 }, 4, .6); this.oneShot("sfx/door_creak", .5, { ...at, y: 5 }, 4, .7, undefined, .5, .6); }
    if (cue === "vanish") { this.oneShot("sfx/breath_heavy", .5, at, 2, .75, undefined, .7); this.oneShot("music/stinger_piano_shock", .4, undefined, 1, .9, music, .4); }
    if (cue === "ring") {
      this.oneShot("sfx/church_bell_toll", 1.4, { ...at, y: 9 }, 14, .62, undefined, .9);
      this.oneShot("sfx/church_bell_toll", 1.1, { ...at, y: 9 }, 14, .62, undefined, .9, 2.4);
      for (let i = 0; i < 6; i++) this.oneShot("sfx/church_bell_toll", .3, { x: -53 + (i % 2 ? 4 : -4), y: 1.6, z: -84 - i * 2.5 }, 6, 2 + i * .07, undefined, .5, 1.2 + i * .35);
    }
    if (cue === "hunt") { this.abbeyHunt = true; this.heartbeat = 0; this.oneShot("music/stinger_horror", .8, undefined, 1, .85, music, .3); this.oneShot("sfx/breath_heavy", .6, at, 3, .6, undefined, .8); }
    if (cue === "banished") { this.abbeyHunt = false; for (let i = 0; i < 4; i++) this.oneShot("sfx/crow_caw", .55, { ...at, y: 2 + i }, 5, .9 + i * .1, undefined, .5, i * .22); this.oneShot("sfx/cloth_whoosh_1", .9, at, 3, .7); }
    if (cue === "caught") { this.abbeyHunt = false; this.oneShot("music/stinger_piano_shock", .9, undefined, 1, .7, music, .5); this.oneShot("sfx/candle_blow_out", 1.2, undefined, 1, .8); }
  }
  whisper() {
    // A breath right behind the player's shoulder.
    const { x, z, yaw } = this.listener;
    this.oneShot("sfx/breath_heavy", .35, { x: x + Math.sin(yaw) * .8 + Math.cos(yaw) * .4, y: 1.6, z: z + Math.cos(yaw) * .8 }, .4, .85, undefined, .1);
    this.oneShot("music/stinger_piano_shock", .55, undefined, 1, 1, this.buses?.music, .3, .4);
  }
  thunder(delay: number, strength: number) {
    this.oneShot(strength > .8 ? "sfx/thunder_crack_roll" : "sfx/thunder_distant", .6 + strength * .6, undefined, 1, 1, this.buses?.amb, .2, delay);
  }

  private roar(name: string, rate: number, volume: number) {
    if (!this.wolf || !this.buses) return;
    const c = this.context, sample = this.samples.get(name);
    if (!c || !sample || c.state !== "running") return;
    for (const [pitch, gainValue, delay] of [[rate, volume, 0], [rate * .67, volume * .45, .035]]) {
      const source = c.createBufferSource(); source.buffer = sample; source.playbackRate.value = pitch;
      const gain = c.createGain(); gain.gain.value = gainValue * 2.2;
      const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 3600;
      source.connect(filter).connect(gain).connect(this.wolf);
      if (this.reverbIn) gain.connect(this.reverbIn);
      source.start(c.currentTime + delay);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
  }

  creature(phase: string) {
    this.tension = ["stirring", "transforming", "pouncing", "feeding", "hunting"].includes(phase) ? 1 : 0;
    this.hunting = phase === "hunting";
    if (phase === "stirring") { this.roar("growl", .85, .6); }
    if (phase === "transforming") { this.roar("growl", .62, .8); this.oneShot("music/stinger_horror", .8, undefined, 1, 1, this.buses?.music, .2); }
    if (phase === "pouncing") { this.roar("attack", .73, 1); this.oneShot("sfx/cloth_whoosh_1", 1, undefined, 1, .8, undefined, .1); }
    if (phase === "feeding") { this.roar("growl", .5, .45); }
    if (phase === "hunting") { this.roar("attack", .57, 1.1); this.heartbeat = 0; }
    if (phase === "fleeing") { this.roar("growl", .95, .5); this.oneShot("sfx/wolf_howl", .7, undefined, 1, 1, this.buses?.creature, .4, 1.8); }
  }

  dispose() {
    this.disposed = true; this.samples.clear();
    this.loops.forEach(l => { try { l.source.stop(); } catch { /* already stopped */ } });
    this.loops.clear();
    if (this.context) void this.context.close();
    this.context = null; this.master = null; this.buses = null;
  }
}
