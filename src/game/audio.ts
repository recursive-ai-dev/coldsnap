// Tiny WebAudio synth — no asset dependencies, instant load.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure() {
  if (!ctx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ensure();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

export function isMuted() {
  return muted;
}

type Wave = OscillatorType;

function tone(freq: number, dur: number, type: Wave = 'square', vol = 0.25, slide = 0) {
  const c = ensure();
  if (!c || !master || muted) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filterFreq = 1200) {
  const c = ensure();
  if (!c || !master || muted) return;
  const now = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(filter).connect(g).connect(master);
  src.start(now);
}

export const sfx = {
  pickup() { tone(880, 0.08, 'square', 0.22); setTimeout(() => tone(1320, 0.09, 'square', 0.22), 40); },
  coin() { tone(1200, 0.06, 'square', 0.22); setTimeout(() => tone(1800, 0.1, 'square', 0.22), 50); },
  big() { tone(660, 0.06, 'square', 0.22); setTimeout(() => tone(990, 0.08, 'square', 0.22), 50); setTimeout(() => tone(1320, 0.14, 'square', 0.22), 110); },
  warm() { tone(440, 0.18, 'triangle', 0.18, 200); },
  hurt() { noise(0.18, 0.25, 800); tone(180, 0.18, 'sawtooth', 0.18, -80); },
  gameover() {
    [660, 520, 392, 260].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 120));
  },
  start() { tone(523, 0.08, 'square', 0.2); setTimeout(() => tone(784, 0.12, 'square', 0.2), 80); },
  click() { tone(700, 0.04, 'square', 0.16); },
};
