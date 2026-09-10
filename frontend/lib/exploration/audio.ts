/** Local CC0 creature recordings and synthesized ambience; starts on a gesture. */
export class VillageAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private creaturePan: StereoPannerNode | null = null;
  private creatureGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private samples = new Map<string, AudioBuffer>();
  private sampleLoad: Promise<void> | null = null;
  private disposed = false;

  async start() {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = .32;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.knee.value = 10; limiter.ratio.value = 8;
      limiter.attack.value = .003; limiter.release.value = .18;
      this.master.connect(limiter).connect(context.destination);
      this.creaturePan = context.createStereoPanner();
      this.creatureGain = context.createGain(); this.creatureGain.gain.value = .7;
      this.creaturePan.connect(this.creatureGain).connect(this.master);
      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * .02) / 1.02;
        data[i] = last * 3;
      }
      this.wind = context.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;
      this.wind.connect(filter).connect(this.master);
      this.wind.start();
      const fireBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
      const fireData = fireBuffer.getChannelData(0);
      let crackle = 0;
      for (let i = 0; i < fireData.length; i++) {
        if (Math.random() < .0004) crackle = .3 + Math.random() * .6;
        crackle *= .97;
        fireData[i] = (Math.random() * 2 - 1) * (.025 + crackle);
      }
      const fire = context.createBufferSource(); fire.buffer = fireBuffer; fire.loop = true;
      this.fireGain = context.createGain(); this.fireGain.gain.value = 0;
      fire.connect(this.fireGain).connect(this.master); fire.start();
    }
    await this.context.resume();
    if (!this.sampleLoad) {
      const context = this.context;
      this.sampleLoad = Promise.allSettled(["attack", "growl"].map(async name => {
        const response = await fetch(`/exploration/audio/${name}.mp3`, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error("Audio asset unavailable");
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) this.samples.set(name, buffer);
      })).then(() => {});
    }
    await this.sampleLoad;
  }

  setActive(active: boolean) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(active ? .32 : 0, this.context.currentTime, .12);
    // Suspending freezes the recordings too, so a paused roar resumes in sync.
    if (active) void this.context.resume().catch(() => {});
    else void this.context.suspend().catch(() => {});
  }

  spatial(player: { x: number; z: number }, yaw: number, wolf: { x: number; z: number }) {
    if (!this.context) return;
    const dx = wolf.x - player.x, dz = wolf.z - player.z;
    const distance = Math.hypot(dx, dz);
    this.creaturePan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, distance))), this.context.currentTime, .1);
    this.creatureGain?.gain.setTargetAtTime(Math.min(1, 5 / Math.max(3, distance)), this.context.currentTime, .1);
    this.fireGain?.gain.setTargetAtTime(.65 / (1 + Math.hypot(player.x, player.z + 32) * .55), this.context.currentTime, .2);
  }

  private roar(name: string, rate: number, volume: number) {
    const c = this.context, sample = this.samples.get(name);
    if (!c || !sample || !this.creaturePan || c.state !== "running") { this.noise(1.2, 420, .2); return; }
    for (const [pitch, gainValue, delay] of [[rate, volume, 0], [rate * .67, volume * .45, .035]]) {
      const source = c.createBufferSource(); source.buffer = sample; source.playbackRate.value = pitch;
      const gain = c.createGain(); gain.gain.value = gainValue;
      const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 3200;
      source.connect(filter).connect(gain).connect(this.creaturePan); source.start(c.currentTime + delay);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
  }

  tone(frequency: number, duration: number, volume: number, pan = 0) {
    const c = this.context;
    if (!c || !this.master || c.state !== "running") return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const spatial = c.createStereoPanner();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * .72, c.currentTime + duration);
    gain.gain.setValueAtTime(.001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, c.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    spatial.pan.value = pan;
    osc.connect(gain).connect(spatial).connect(this.master);
    osc.start();
    osc.stop(c.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); spatial.disconnect(); };
  }

  step(running: boolean) { this.tone(running ? 76 : 58, .14, .28); }
  bell() { [174, 348, 467].forEach(f => this.tone(f, 4, .09, -.6)); }
  whisper() { this.tone(93, 2.5, .12, .8); }
  creature(phase: string) {
    if (phase === "stirring") { this.roar("growl", .85, .6); }
    if (phase === "transforming") {
      [46, 69, 94, 141].forEach(f => this.tone(f, 4.5, .1, -.2));
      this.noise(1.1, 360, .24);
      this.roar("growl", .62, .8);
    }
    if (phase === "pouncing") { this.roar("attack", .73, 1); this.noise(.35, 150, .3); }
    if (phase === "feeding") { this.noise(3.8, 230, .2); }
    if (phase === "hunting") { this.roar("attack", .57, 1.1); }
    if (phase === "fleeing") { this.roar("growl", .95, .5); }
  }
  private noise(duration: number, frequency: number, volume: number) {
    const c = this.context;
    if (!c || !this.master || c.state !== "running") return;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (.5 + .5 * Math.sin(i / c.sampleRate * 29));
    const source = c.createBufferSource(); source.buffer = buffer;
    const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = frequency;
    const gain = c.createGain(); gain.gain.setValueAtTime(.001, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + .05);
    gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  dispose() {
    this.disposed = true; this.samples.clear();
    this.wind?.stop();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
