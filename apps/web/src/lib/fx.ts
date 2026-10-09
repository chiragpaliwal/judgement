// Synthesised sounds (no asset files) and haptics. DESIGN_SPEC §7.
import { usePrefs } from './prefs';

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!usePrefs.getState().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Unlock audio on the first user gesture (iOS). */
export function unlockAudio() {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.08, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  deal(cards: number) {
    const n = Math.min(cards, 8);
    const stagger = Math.min(0.04, 0.56 / Math.max(1, cards));
    for (let i = 0; i < n; i++) noise(0.05, { delay: i * stagger * (cards / n), gain: 0.12, freq: 3200 });
  },
  card() {
    noise(0.07, { gain: 0.22, freq: 1800 });
    tone(180, 0.06, { type: 'triangle', gain: 0.05 });
  },
  sweep() {
    noise(0.22, { gain: 0.14, freq: 1200 });
  },
  turn() {
    tone(880, 0.14, { gain: 0.05 });
    tone(1320, 0.18, { gain: 0.04, delay: 0.09 });
  },
  bid() {
    tone(520, 0.08, { type: 'triangle', gain: 0.05 });
  },
  hook() {
    tone(220, 0.22, { type: 'triangle', gain: 0.09, slide: 140 });
  },
  made() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.28, { gain: 0.05, delay: i * 0.07 }));
  },
  missed() {
    tone(300, 0.3, { type: 'triangle', gain: 0.07, slide: 180 });
  },
  bust() {
    tone(240, 0.2, { type: 'square', gain: 0.025, slide: 160 });
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, { gain: 0.05, delay: i * 0.1 }));
  },
  pop() {
    tone(660, 0.06, { gain: 0.04 });
  },
};

export function haptic(kind: 'light' | 'medium' | 'turn' | 'made' | 'missed') {
  if (!usePrefs.getState().haptics) return;
  const pattern = { light: [10], medium: [35], turn: [30], made: [20, 40, 20], missed: [80] }[kind];
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
