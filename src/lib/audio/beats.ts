/**
 * Tempo estimation and beat tracking.
 *
 * Tempo: autocorrelation of the onset envelope with a log-normal prior
 * around typical dance tempos, with octave-error correction.
 * Beats: Ellis (2007) dynamic-programming beat tracker, the same formulation
 * librosa uses.
 */

export interface TempoEstimate {
  bpm: number;
  /** 0..1 how peaked the autocorrelation was at the chosen lag. */
  confidence: number;
}

export interface TempoOptions {
  minBpm?: number;
  maxBpm?: number;
  priorBpm?: number;
  /** Width of the log2 prior (octaves). */
  priorSigma?: number;
}

export function autocorrelate(x: Float32Array, maxLag: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
    out[lag] = s / Math.max(1, n - lag);
  }
  return out;
}

export function estimateTempo(flux: Float32Array, frameDur: number, o: TempoOptions = {}): TempoEstimate {
  const minBpm = o.minBpm ?? 50;
  const maxBpm = o.maxBpm ?? 220;
  const priorBpm = o.priorBpm ?? 118;
  const priorSigma = o.priorSigma ?? 0.9;

  // Remove DC so the autocorrelation reflects periodicity, not level.
  let mean = 0;
  for (let i = 0; i < flux.length; i++) mean += flux[i];
  mean /= Math.max(1, flux.length);
  const x = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) x[i] = flux[i] - mean;

  const minLag = Math.max(1, Math.floor(60 / maxBpm / frameDur));
  const maxLag = Math.min(x.length - 1, Math.ceil(60 / minBpm / frameDur));
  if (maxLag <= minLag) return { bpm: 120, confidence: 0 };
  const acf = autocorrelate(x, Math.min(x.length - 1, maxLag * 2 + 2));
  const acf0 = acf[0] || 1;

  const weight = (lag: number) => {
    const bpm = 60 / (lag * frameDur);
    const z = Math.log2(bpm / priorBpm) / priorSigma;
    return Math.exp(-0.5 * z * z);
  };

  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // include harmonic support to stabilise against octave errors
    const a = acf[lag] / acf0;
    const a2 = 2 * lag < acf.length ? acf[2 * lag] / acf0 : 0;
    const ah = acf[Math.round(lag / 2)] / acf0;
    const score = weight(lag) * (a + 0.5 * a2 + 0.25 * ah);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Refine the lag with parabolic interpolation on the raw ACF.
  let refined = bestLag;
  if (bestLag > 0 && bestLag + 1 < acf.length) {
    const y0 = acf[bestLag - 1];
    const y1 = acf[bestLag];
    const y2 = acf[bestLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) {
      const d = (0.5 * (y0 - y2)) / denom;
      if (Math.abs(d) < 1) refined = bestLag + d;
    }
  }

  let bpm = 60 / (refined * frameDur);
  // Prefer the 70..165 range for light shows: fold octave errors.
  const supportAt = (lag: number) => (lag >= 1 && lag < acf.length ? acf[Math.round(lag)] / acf0 : -1);
  if (bpm > 165 && supportAt(refined * 2) > 0.5 * supportAt(refined)) bpm /= 2;
  else if (bpm < 70 && supportAt(refined / 2) > 0.5 * supportAt(refined)) bpm *= 2;

  const confidence = Math.max(0, Math.min(1, acf[bestLag] / acf0));
  return { bpm, confidence };
}

export interface BeatTrackOptions {
  /** Penalty weight for deviating from the tempo (librosa default 100). */
  tightness?: number;
  /** Remove weak leading/trailing beats. */
  trim?: boolean;
}

/**
 * Ellis dynamic-programming beat tracker. Returns beat positions in frames.
 */
export function trackBeats(flux: Float32Array, frameDur: number, bpm: number, o: BeatTrackOptions = {}): number[] {
  const tightness = o.tightness ?? 100;
  const n = flux.length;
  if (n === 0 || bpm <= 0) return [];
  const period = 60 / bpm / frameDur; // frames per beat
  if (period < 2) return [];

  // Normalise by std and smooth with a Gaussian of std period/32.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += flux[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (flux[i] - mean) ** 2;
  const std = Math.sqrt(variance / n) || 1;
  const sigma = period / 32;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * r + 1);
  for (let i = -r; i <= r; i++) kernel[i + r] = Math.exp(-0.5 * (i / sigma) ** 2);
  const localscore = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      const k = i + j;
      if (k >= 0 && k < n) acc += (flux[k] / std) * kernel[j + r];
    }
    localscore[i] = acc;
  }

  const backlink = new Int32Array(n).fill(-1);
  const cumscore = new Float32Array(n);
  const winStart = -Math.round(2 * period);
  const winEnd = -Math.round(period / 2);
  const txwt = new Float32Array(winEnd - winStart + 1);
  for (let p = winStart; p <= winEnd; p++) {
    txwt[p - winStart] = -tightness * Math.log(-p / period) ** 2;
  }
  let firstBeatFound = false;
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let bestIdx = -1;
    for (let p = winStart; p <= winEnd; p++) {
      const j = i + p;
      if (j < 0) continue;
      const s = txwt[p - winStart] + cumscore[j];
      if (s > best) {
        best = s;
        bestIdx = j;
      }
    }
    if (bestIdx < 0) {
      cumscore[i] = localscore[i];
    } else {
      cumscore[i] = localscore[i] + best;
      // Do not link back into the silent pre-roll before any beat evidence.
      if (firstBeatFound || localscore[i] > 0.01) backlink[i] = bestIdx;
    }
    if (!firstBeatFound && localscore[i] > 0.01) firstBeatFound = true;
  }

  // Pick the last beat: last local max of cumscore above half the median of local maxima.
  const maxima: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (cumscore[i] >= cumscore[i - 1] && cumscore[i] >= cumscore[i + 1] && cumscore[i] > 0) maxima.push(i);
  }
  if (maxima.length === 0) return [];
  const sortedVals = maxima.map((i) => cumscore[i]).sort((a, b) => a - b);
  const median = sortedVals[Math.floor(sortedVals.length / 2)];
  let tail = maxima[maxima.length - 1];
  for (let k = maxima.length - 1; k >= 0; k--) {
    if (cumscore[maxima[k]] >= 0.5 * median) {
      tail = maxima[k];
      break;
    }
  }

  const beats: number[] = [];
  let b = tail;
  while (b >= 0) {
    beats.push(b);
    b = backlink[b];
  }
  beats.reverse();

  if (o.trim ?? true) {
    // Trim weak beats at the edges, as librosa does.
    const boe = beats.map((i) => localscore[i]);
    const hann5 = [0, 0.5, 1, 0.5, 0];
    const smooth = boe.map((_, i) => {
      let s = 0;
      for (let j = -2; j <= 2; j++) {
        const k = i + j;
        if (k >= 0 && k < boe.length) s += boe[k] * hann5[j + 2];
      }
      return s;
    });
    const rmsVal = Math.sqrt(smooth.reduce((a, v) => a + v * v, 0) / Math.max(1, smooth.length));
    const thr = 0.5 * rmsVal;
    let lo = 0;
    while (lo < beats.length && smooth[lo] <= thr) lo++;
    let hi = beats.length - 1;
    while (hi > lo && smooth[hi] <= thr) hi--;
    return beats.slice(lo, hi + 1);
  }
  return beats;
}

/**
 * Choose which beat is the downbeat (bar start), assuming 4/4.
 * Scores each of the four phases by low-frequency onset energy, overall
 * onset energy and spectral change at the candidate downbeats.
 */
export function detectDownbeatPhase(
  beatFrames: number[],
  flux: Float32Array,
  fluxLow: Float32Array,
  logSpec: Float32Array,
  bandCount: number,
  beatsPerBar = 4,
): number {
  if (beatFrames.length < beatsPerBar) return 0;
  const n = flux.length;
  const at = (arr: Float32Array, f: number) => {
    let m = 0;
    for (let k = -2; k <= 2; k++) {
      const i = f + k;
      if (i >= 0 && i < n) m = Math.max(m, arr[i]);
    }
    return m;
  };
  const profile = (a: number, b: number, out: Float32Array) => {
    out.fill(0);
    const lo = Math.max(0, a);
    const hi = Math.min(n, b);
    if (hi <= lo) return;
    for (let t = lo; t < hi; t++) {
      for (let k = 0; k < bandCount; k++) out[k] += logSpec[t * bandCount + k];
    }
    for (let k = 0; k < bandCount; k++) out[k] /= hi - lo;
  };
  const before = new Float32Array(bandCount);
  const after = new Float32Array(bandCount);
  const specChange = new Float32Array(beatFrames.length);
  const lowAt = new Float32Array(beatFrames.length);
  const fluxAt = new Float32Array(beatFrames.length);
  for (let i = 0; i < beatFrames.length; i++) {
    const f = beatFrames[i];
    const prev = i > 0 ? beatFrames[i - 1] : Math.max(0, f - (beatFrames[i + 1] ?? f + 10) + f);
    const next = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(n, f + (f - prev));
    profile(prev, f, before);
    profile(f, next, after);
    let d = 0;
    for (let k = 0; k < bandCount; k++) d += Math.abs(after[k] - before[k]);
    specChange[i] = d;
    lowAt[i] = at(fluxLow, f);
    fluxAt[i] = at(flux, f);
  }
  const norm = (arr: Float32Array) => {
    let m = 0;
    for (let i = 0; i < arr.length; i++) m += arr[i];
    m /= Math.max(1, arr.length);
    return m > 0 ? m : 1;
  };
  const nLow = norm(lowAt);
  const nFlux = norm(fluxAt);
  const nSpec = norm(specChange);
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let p = 0; p < beatsPerBar; p++) {
    let s = 0;
    let count = 0;
    for (let i = p; i < beatFrames.length; i += beatsPerBar) {
      s += lowAt[i] / nLow + 0.6 * (fluxAt[i] / nFlux) + 0.8 * (specChange[i] / nSpec);
      count++;
    }
    s /= Math.max(1, count);
    if (s > bestScore) {
      bestScore = s;
      bestPhase = p;
    }
  }
  return bestPhase;
}
