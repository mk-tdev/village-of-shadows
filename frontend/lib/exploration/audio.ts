/** Synthesized ambience: no network, microphone, or autoplay before a gesture. */
export class VillageAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;

  async start() {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = .32;
      this.master.connect(context.destination);
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
    }
    await this.context.resume();
  }

  setActive(active: boolean) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(active ? .32 : 0, this.context.currentTime, .12);
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
    if (phase === "stirring") { this.tone(72, 1.8, .16, -.2); }
    if (phase === "transforming") {
      [46, 69, 94, 141].forEach(f => this.tone(f, 4.5, .1, -.2));
      this.noise(1.1, 360, .24);
    }
    if (phase === "pouncing") { this.noise(.65, 150, .5); this.tone(52, .7, .35); }
    if (phase === "feeding") { this.noise(3.8, 230, .2); }
    if (phase === "hunting") { this.tone(58, 2.7, .25); this.tone(117, 2.7, .12); }
    if (phase === "fleeing") { this.tone(220, 3, .17, -.6); this.tone(330, 3, .09, -.6); }
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
    this.wind?.stop();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
