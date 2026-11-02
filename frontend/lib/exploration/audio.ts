import type { Surface } from "./world";
import { BOUNDS, CHAPEL, COUNCIL } from "./world";

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
    // Ambient events, each at a fresh random interval.
    const now = this.context!.currentTime;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const edge = () => { const a = Math.random() * Math.PI * 2; return { x: this.listener.x + Math.cos(a) * 35, y: 6, z: this.listener.z + Math.sin(a) * 35 }; };
    this.schedule = [
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

  spatial(player: { x: number; z: number }, yaw: number, wolf: { x: number; z: number }) {
    const c = this.context;
    if (!c || !this.buses) return;
    const t = c.currentTime, L = c.listener;
    this.listener = { x: player.x, z: player.z, yaw };
    L.positionX.setTargetAtTime(player.x, t, .05); L.positionY.setTargetAtTime(1.65, t, .05); L.positionZ.setTargetAtTime(player.z, t, .05);
    L.forwardX.setTargetAtTime(-Math.sin(yaw), t, .05); L.forwardY.setTargetAtTime(0, t, .05); L.forwardZ.setTargetAtTime(-Math.cos(yaw), t, .05);
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    if (this.wolf) this.place(this.wolf, { x: wolf.x, y: 1.1, z: wolf.z });
    // Forest night swells near the palisade; the music bed recedes near the fire.
    const edge = Math.min(player.x - BOUNDS.minX, BOUNDS.maxX - player.x, player.z - BOUNDS.minZ, BOUNDS.maxZ - player.z);
    this.loops.get("amb/forest_night_crickets_owl@")?.gain.gain.setTargetAtTime(Math.max(.08, .6 - edge * .04), t, 1);
    const atFire = Math.hypot(player.x - COUNCIL.x, player.z - COUNCIL.z) < 9;
    this.loops.get("music/explore_dark_ambience_loop@")?.gain.gain.setTargetAtTime(this.tension > 0 ? .15 : atFire ? .35 : .8, t, 1.5);
    this.loops.get("music/tension_suspense_loop@")?.gain.gain.setTargetAtTime(this.tension > 0 && !this.hunting ? .9 : this.hunting ? .45 : 0, t, 1.2);
    this.loops.get("music/chase_drums_loop@")?.gain.gain.setTargetAtTime(this.hunting ? .9 : 0, t, .6);
    // Ambient scheduler and heartbeat run off the audio clock, so pause freezes them.
    for (const event of this.schedule) if (t >= event.at) { event.play(); event.at = t + event.every[0] + Math.random() * (event.every[1] - event.every[0]); }
    if (this.hunting && t >= this.heartbeat) {
      const distance = Math.hypot(wolf.x - player.x, wolf.z - player.z);
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
