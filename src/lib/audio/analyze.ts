/**
 * Full analysis pipeline: mono PCM -> beats, bars, onsets, energy curves,
 * sections. Pure TypeScript; runs in a Worker or in Node.
 */
import { computeFeatures, gaussianSmooth, percentile, type Features } from './features';
import { detectOnsets, type Onset } from './onsets';
import { detectDownbeatPhase, estimateTempo, trackBeats } from './beats';
import { segmentSections, type Section } from './sections';

export const SHOW_FPS = 50;

export interface Beat {
  time: number;
  /** 0..1 onset strength at the beat. */
  strength: number;
  /** Sequential index in the beat grid. */
  index: number;
  /** Bar number (0-based). */
  bar: number;
  /** 0..3 position within the bar. */
  beatInBar: number;
  /** True for grid beats extrapolated into regions without beat evidence. */
  inferred: boolean;
}

export interface AnalysisResult {
  duration: number;
  sampleRate: number;
  bpm: number;
  beatPeriod: number;
  tempoConfidence: number;
  beats: Beat[];
  /** Downbeat (bar start) times. */
  bars: number[];
  onsets: { low: Onset[]; mid: Onset[]; high: Onset[] };
  fps: number;
  /** Per 20 ms frame, 0..1 perceptual loudness. */
  loudness: Float32Array;
  /** Per 20 ms frame, 0..1 low-frequency energy. */
  lowEnergy: Float32Array;
  /** Per 20 ms frame, 0..1 high-frequency energy. */
  highEnergy: Float32Array;
  sections: Section[];
  firstSound: number;
  lastSound: number;
}

export type ProgressFn = (stage: string, fraction: number) => void;

function resampleTo(x: Float32Array, srcDur: number, count: number, dstDur: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i * dstDur;
    const p = t / srcDur;
    const i0 = Math.floor(p);
    const i1 = Math.min(x.length - 1, i0 + 1);
    const fr = p - i0;
    const a = x[Math.min(x.length - 1, Math.max(0, i0))];
    const b = x[Math.max(0, i1)];
    out[i] = a + (b - a) * fr;
  }
  return out;
}

function toUnitCurve(x: Float32Array, frameDur: number, smoothS: number, compress: 'db' | 'sqrt'): Float32Array {
  const n = x.length;
  const y = new Float32Array(n);
  if (compress === 'db') {
    for (let i = 0; i < n; i++) y[i] = 20 * Math.log10(x[i] + 1e-6);
    const active = Array.from(y).filter((v) => v > -80);
    const lo = active.length ? percentile(active, 0.05) : -60;
    const hi = active.length ? percentile(active, 0.99) : 0;
    const range = Math.max(6, hi - lo);
    for (let i = 0; i < n; i++) y[i] = Math.min(1, Math.max(0, (y[i] - lo) / range));
  } else {
    const hi = percentile(x, 0.98) || 1;
    for (let i = 0; i < n; i++) y[i] = Math.min(1, Math.sqrt(Math.max(0, x[i] / hi)));
  }
  return gaussianSmooth(y, smoothS / frameDur);
}

/** Extend the tracked beats into a full grid covering [start, end). */
function buildBeatGrid(trackedTimes: number[], strengths: number[], period: number, start: number, end: number): Beat[] {
  const beats: Beat[] = [];
  if (trackedTimes.length === 0) {
    for (let t = start; t < end; t += period) {
      beats.push({ time: t, strength: 0, index: 0, bar: 0, beatInBar: 0, inferred: true });
    }
  } else {
    // local period from the first/last few intervals
    const first = trackedTimes[0];
    const last = trackedTimes[trackedTimes.length - 1];
    const localPeriod = (i0: number, i1: number) => {
      const iv: number[] = [];
      for (let i = i0 + 1; i <= i1; i++) iv.push(trackedTimes[i] - trackedTimes[i - 1]);
      iv.sort((a, b) => a - b);
      return iv.length ? iv[Math.floor(iv.length / 2)] : period;
    };
    const pHead = localPeriod(0, Math.min(trackedTimes.length - 1, 8));
    const pTail = localPeriod(Math.max(0, trackedTimes.length - 9), trackedTimes.length - 1);
    for (let t = first - pHead; t >= start - pHead * 0.5; t -= pHead) {
      beats.unshift({ time: t, strength: 0, index: 0, bar: 0, beatInBar: 0, inferred: true });
    }
    trackedTimes.forEach((t, i) => beats.push({ time: t, strength: strengths[i], index: 0, bar: 0, beatInBar: 0, inferred: false }));
    for (let t = last + pTail; t < end; t += pTail) {
      beats.push({ time: t, strength: 0, index: 0, bar: 0, beatInBar: 0, inferred: true });
    }
  }
  beats.forEach((b, i) => (b.index = i));
  return beats.filter((b) => b.time >= 0);
}

export function analyze(mono: Float32Array, sampleRate: number, onProgress?: ProgressFn): AnalysisResult {
  const duration = mono.length / sampleRate;
  const f: Features = computeFeatures(mono, sampleRate, {}, (p) => onProgress?.('Analysing spectrum', p * 0.6));

  onProgress?.('Finding the tempo', 0.62);
  const tempo = estimateTempo(f.flux, f.frameDur);
  const bpm = tempo.bpm;
  const period = 60 / bpm;

  onProgress?.('Tracking beats', 0.7);
  const beatFrames = trackBeats(f.flux, f.frameDur, bpm);
  const beatTimes = beatFrames.map((i) => i * f.frameDur);
  const strengthsRaw = beatFrames.map((i) => {
    let m = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < f.flux.length) m = Math.max(m, f.flux[j]);
    }
    return m;
  });
  const sNorm = percentile(strengthsRaw, 0.9) || 1;
  const strengths = strengthsRaw.map((s) => Math.min(1, s / sNorm));

  // Where does the music actually start/end?
  const dbCurve = Array.from(f.rms).map((v) => 20 * Math.log10(v + 1e-6));
  const peakDb = Math.max(...dbCurve);
  const gate = peakDb - 45;
  let firstFrame = dbCurve.findIndex((v) => v > gate);
  if (firstFrame < 0) firstFrame = 0;
  let lastFrame = dbCurve.length - 1;
  while (lastFrame > firstFrame && dbCurve[lastFrame] <= gate) lastFrame--;
  const firstSound = firstFrame * f.frameDur;
  const lastSound = Math.min(duration, (lastFrame + 1) * f.frameDur);

  onProgress?.('Finding downbeats', 0.8);
  const phase = detectDownbeatPhase(beatFrames, f.flux, f.fluxLow, f.logSpec, f.bandCount);
  const beats = buildBeatGrid(beatTimes, strengths, period, firstSound, lastSound);
  // Assign bars so that tracked beat `phase` is a downbeat.
  const firstTrackedIdx = beats.findIndex((b) => !b.inferred);
  const anchor = firstTrackedIdx >= 0 ? firstTrackedIdx + phase : 0;
  const bars: number[] = [];
  for (const b of beats) {
    const rel = b.index - anchor;
    b.beatInBar = ((rel % 4) + 4) % 4;
    b.bar = Math.floor(rel / 4);
    if (b.beatInBar === 0) bars.push(b.time);
  }
  // Re-base bar numbers at 0.
  const minBar = beats.length ? Math.min(...beats.map((b) => b.bar)) : 0;
  for (const b of beats) b.bar -= minBar;

  onProgress?.('Detecting hits', 0.86);
  const onsets = {
    low: detectOnsets(f.fluxLow, f.frameDur, 0.09),
    mid: detectOnsets(f.fluxMid, f.frameDur, 0.08),
    high: detectOnsets(f.fluxHigh, f.frameDur, 0.06),
  };

  onProgress?.('Mapping song structure', 0.92);
  const sections = segmentSections(bars, lastSound, f);
  if (sections.length) {
    sections[0].startTime = 0;
    sections[sections.length - 1].endTime = duration;
  }

  const frameCount = Math.max(1, Math.ceil(duration * SHOW_FPS));
  const dst = 1 / SHOW_FPS;
  const loudness = resampleTo(toUnitCurve(f.rms, f.frameDur, 0.06, 'db'), f.frameDur, frameCount, dst);
  const lowEnergy = resampleTo(toUnitCurve(f.energyLow, f.frameDur, 0.04, 'sqrt'), f.frameDur, frameCount, dst);
  const highEnergy = resampleTo(toUnitCurve(f.energyHigh, f.frameDur, 0.04, 'sqrt'), f.frameDur, frameCount, dst);

  onProgress?.('Done', 1);
  return {
    duration,
    sampleRate,
    bpm,
    beatPeriod: period,
    tempoConfidence: tempo.confidence,
    beats,
    bars,
    onsets,
    fps: SHOW_FPS,
    loudness,
    lowEnergy,
    highEnergy,
    sections,
    firstSound,
    lastSound,
  };
}
