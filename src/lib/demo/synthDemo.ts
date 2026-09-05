/**
 * A tiny deterministic synthesizer that renders a 40 s electronic demo track
 * (intro / groove / build / drop / outro) so the app can be tried without
 * uploading anything.
 */
export interface DemoTrack {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  bpm: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function synthDemoTrack(sampleRate = 44100): DemoTrack {
  const bpm = 124;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = 28; // 4 intro + 8 groove + 4 build + 8 drop + 4 outro
  const length = Math.ceil(bar * bars * sampleRate) + sampleRate;
  const L = new Float32Array(length);
  const R = new Float32Array(length);
  const rand = rng(1234);
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i++) noise[i] = rand() * 2 - 1;

  const add = (t0: number, dur: number, fn: (t: number, i: number) => number, pan = 0, gain = 1) => {
    const s0 = Math.floor(t0 * sampleRate);
    const n = Math.floor(dur * sampleRate);
    const gl = gain * (pan <= 0 ? 1 : 1 - pan);
    const gr = gain * (pan >= 0 ? 1 : 1 + pan);
    for (let i = 0; i < n; i++) {
      const idx = s0 + i;
      if (idx >= length) break;
      const v = fn(i / sampleRate, idx);
      L[idx] += v * gl;
      R[idx] += v * gr;
    }
  };

  const kick = (t0: number) =>
    add(t0, 0.35, (t) => {
      const env = Math.exp(-t * 9);
      const f = 48 + 110 * Math.exp(-t * 32);
      return Math.sin(2 * Math.PI * f * t) * env * 0.95;
    });
  const snare = (t0: number, gain = 0.6) =>
    add(t0, 0.2, (t, i) => {
      const env = Math.exp(-t * 22);
      return (noise[i] * 0.7 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * env;
    }, 0, gain);
  const clap = (t0: number) => {
    snare(t0, 0.45);
    snare(t0 + 0.012, 0.3);
  };
  const hat = (t0: number, open = false, pan = 0) =>
    add(t0, open ? 0.18 : 0.06, (t, i) => {
      const env = Math.exp(-t * (open ? 18 : 60));
      // crude high-pass: difference of successive noise samples
      return (noise[i] - noise[Math.max(0, i - 1)]) * env;
    }, pan, 0.22);
  const bass = (t0: number, freq: number, dur: number) =>
    add(t0, dur, (t) => {
      const env = Math.min(1, t * 80) * Math.exp(-t * 3);
      const saw = 2 * ((t * freq) % 1) - 1;
      return (saw * 0.5 + Math.sin(2 * Math.PI * freq * t) * 0.5) * env * 0.4;
    });
  const pad = (t0: number, freqs: number[], dur: number, gain = 0.12) =>
    add(t0, dur, (t) => {
      const a = Math.min(1, t / 0.6);
      const r = Math.min(1, Math.max(0, (dur - t) / 0.8));
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.005 * t);
      return (v / freqs.length) * a * r;
    }, 0, gain);
  const lead = (t0: number, freq: number, dur: number, pan: number) =>
    add(t0, dur, (t) => {
      const env = Math.min(1, t * 40) * Math.exp(-t * 4);
      const s1 = 2 * ((t * freq) % 1) - 1;
      const s2 = 2 * ((t * freq * 1.01) % 1) - 1;
      return (s1 + s2) * 0.5 * env * 0.25;
    }, pan);
  const riser = (t0: number, dur: number) =>
    add(t0, dur, (t, i) => {
      const p = t / dur;
      return noise[i] * p * p * 0.35;
    });

  const A = 55; // A1
  const bassLine = [A, A, A * 1.5, A * 1.3348]; // A A E C
  const chords = [
    [220, 261.63, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [164.81, 196, 246.94],
  ];

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const section = b < 4 ? 'intro' : b < 12 ? 'groove' : b < 16 ? 'build' : b < 24 ? 'drop' : 'outro';
    if (section === 'intro' || section === 'outro') {
      pad(t, chords[b % 4], bar, 0.14);
      if (b % 2 === 1 || section === 'outro') for (let k = 0; k < 4; k++) hat(t + k * beat + beat / 2, false, k % 2 ? 0.4 : -0.4);
      if (section === 'intro' && b >= 2) kick(t);
      continue;
    }
    // drums
    for (let k = 0; k < 4; k++) {
      kick(t + k * beat);
      hat(t + k * beat + beat / 2, k === 3, k % 2 ? 0.5 : -0.5);
      if (section === 'drop') hat(t + k * beat, false, 0);
      if (k === 1 || k === 3) section === 'drop' ? clap(t + k * beat) : snare(t + k * beat, 0.45);
    }
    if (section === 'build') {
      const sub = b - 12; // 0..3
      const div = [4, 4, 8, 16][sub];
      for (let k = 0; k < div; k++) snare(t + (k * bar) / div, 0.3 + 0.1 * sub);
      riser(t, bar);
      pad(t, chords[b % 4], bar, 0.1 + 0.03 * sub);
      continue;
    }
    // bass
    for (let k = 0; k < 8; k++) bass(t + (k * beat) / 2, bassLine[b % 4] * (k % 2 ? 2 : 1), beat / 2);
    pad(t, chords[b % 4], bar, section === 'drop' ? 0.1 : 0.12);
    if (section === 'drop') {
      const notes = chords[b % 4].map((f) => f * 2);
      const pattern = [0, 2, 1, 2, 0, 1, 2, 1];
      for (let k = 0; k < 8; k++) lead(t + (k * beat) / 2, notes[pattern[k]], beat / 2, k % 2 ? 0.3 : -0.3);
    }
  }

  // soft limiter
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < length; i++) {
    L[i] = Math.tanh(L[i] * g * 1.2);
    R[i] = Math.tanh(R[i] * g * 1.2);
  }
  return { left: L, right: R, sampleRate, bpm };
}
