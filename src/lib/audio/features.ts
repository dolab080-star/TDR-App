/**
 * Frame-level audio features: log band spectrogram, spectral flux (onset
 * strength) overall and per frequency group, RMS loudness.
 *
 * Everything is plain Float32Array math so it runs identically in a Web
 * Worker and in Node tests.
 */
import { FFT, hannWindow } from './fft';

export interface FeatureOptions {
  fftSize?: number;
  hop?: number;
  bands?: number;
  minHz?: number;
  maxHz?: number;
}

export interface Features {
  sampleRate: number;
  fftSize: number;
  hop: number;
  /** Seconds per feature frame. */
  frameDur: number;
  frameCount: number;
  bandCount: number;
  /** Band centre frequencies (Hz). */
  bandHz: Float32Array;
  /** frameCount x bandCount log-compressed band energies. */
  logSpec: Float32Array;
  /** Onset strength envelope (local-mean removed, rectified, normalised). */
  flux: Float32Array;
  /** Per-group rectified spectral flux, lightly smoothed (not mean-removed). */
  fluxLow: Float32Array;
  fluxMid: Float32Array;
  fluxHigh: Float32Array;
  /** Per-frame RMS of the raw signal (linear, 0..1). */
  rms: Float32Array;
  /** Per-frame linear energy in the low/mid/high groups. */
  energyLow: Float32Array;
  energyMid: Float32Array;
  energyHigh: Float32Array;
}

export const GROUP_HZ = {
  low: [30, 170],
  mid: [170, 2500],
  high: [4000, 16000],
} as const;

interface Filter {
  start: number; // first bin
  weights: Float32Array;
}

function buildFilterbank(bands: number, fftSize: number, sampleRate: number, minHz: number, maxHz: number) {
  const nyq = sampleRate / 2;
  maxHz = Math.min(maxHz, nyq * 0.95);
  const binHz = sampleRate / fftSize;
  // log-spaced edges
  const edges = new Float64Array(bands + 2);
  const lmin = Math.log(minHz);
  const lmax = Math.log(maxHz);
  for (let i = 0; i < bands + 2; i++) edges[i] = Math.exp(lmin + ((lmax - lmin) * i) / (bands + 1));
  const filters: Filter[] = [];
  const centers = new Float32Array(bands);
  for (let b = 0; b < bands; b++) {
    const lo = edges[b];
    const c = edges[b + 1];
    const hi = edges[b + 2];
    centers[b] = c;
    const startBin = Math.max(1, Math.floor(lo / binHz));
    const endBin = Math.min(fftSize / 2, Math.ceil(hi / binHz));
    const w = new Float32Array(Math.max(1, endBin - startBin + 1));
    let sum = 0;
    for (let k = startBin; k <= endBin; k++) {
      const f = k * binHz;
      let v = 0;
      if (f >= lo && f <= c) v = (f - lo) / Math.max(1e-9, c - lo);
      else if (f > c && f <= hi) v = (hi - f) / Math.max(1e-9, hi - c);
      // make sure very narrow low bands still capture their nearest bin
      w[k - startBin] = v;
      sum += v;
    }
    if (sum <= 0) {
      // narrow band: take the nearest bin
      const k = Math.min(fftSize / 2, Math.max(1, Math.round(c / binHz)));
      filters.push({ start: k, weights: new Float32Array([1]) });
      continue;
    }
    for (let i = 0; i < w.length; i++) w[i] /= sum;
    filters.push({ start: startBin, weights: w });
  }
  return { filters, centers };
}

/** Moving average with a centred window of `radius` frames each side. */
export function movingAverage(x: Float32Array, radius: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

/** Gaussian smoothing with std `sigma` frames (truncated at 3 sigma). */
export function gaussianSmooth(x: Float32Array, sigma: number): Float32Array {
  if (sigma <= 0) return Float32Array.from(x);
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-0.5 * (i / sigma) ** 2);
    k[i + r] = v;
    s += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      const idx = Math.min(n - 1, Math.max(0, i + j));
      acc += x[idx] * k[j + r];
    }
    out[i] = acc;
  }
  return out;
}

export function percentile(x: ArrayLike<number>, p: number): number {
  const arr = Array.from(x).sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const i = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
  return arr[i];
}

export function computeFeatures(
  mono: Float32Array,
  sampleRate: number,
  opts: FeatureOptions = {},
  onProgress?: (fraction: number) => void,
): Features {
  const fftSize = opts.fftSize ?? (sampleRate > 32000 ? 2048 : 1024);
  const hop = opts.hop ?? fftSize / 4;
  const bands = opts.bands ?? 40;
  const minHz = opts.minHz ?? 30;
  const maxHz = opts.maxHz ?? 16000;

  const frameCount = Math.max(1, Math.ceil(mono.length / hop));
  const frameDur = hop / sampleRate;
  const { filters, centers } = buildFilterbank(bands, fftSize, sampleRate, minHz, maxHz);

  const fft = new FFT(fftSize);
  const win = hannWindow(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const power = new Float32Array(fftSize / 2 + 1);
  const norm = 2 / fftSize; // full-scale sine -> magnitude 1

  const logSpec = new Float32Array(frameCount * bands);
  const rms = new Float32Array(frameCount);
  const energyLow = new Float32Array(frameCount);
  const energyMid = new Float32Array(frameCount);
  const energyHigh = new Float32Array(frameCount);
  const fluxRaw = new Float32Array(frameCount);
  const fluxLow = new Float32Array(frameCount);
  const fluxMid = new Float32Array(frameCount);
  const fluxHigh = new Float32Array(frameCount);

  const groupOf = new Int8Array(bands); // 0 low, 1 mid, 2 high, -1 none
  for (let b = 0; b < bands; b++) {
    const c = centers[b];
    groupOf[b] = c < GROUP_HZ.low[1] ? 0 : c < GROUP_HZ.mid[1] ? 1 : c >= GROUP_HZ.high[0] ? 2 : -1;
  }

  const mu = 1000;
  const prevLog = new Float32Array(bands);
  const curLog = new Float32Array(bands);
  const half = fftSize >> 1;
  const progressEvery = Math.max(1, Math.floor(frameCount / 50));

  for (let t = 0; t < frameCount; t++) {
    const center = t * hop;
    const start = center - half;
    let sq = 0;
    for (let i = 0; i < fftSize; i++) {
      const si = start + i;
      const v = si >= 0 && si < mono.length ? mono[si] : 0;
      re[i] = v * win[i];
      im[i] = 0;
      sq += v * v;
    }
    rms[t] = Math.sqrt(sq / fftSize);
    fft.transform(re, im);
    for (let k = 0; k <= half; k++) {
      const r = re[k] * norm;
      const q = im[k] * norm;
      power[k] = r * r + q * q;
    }
    let eL = 0;
    let eM = 0;
    let eH = 0;
    let fAll = 0;
    let fL = 0;
    let fM = 0;
    let fH = 0;
    for (let b = 0; b < bands; b++) {
      const f = filters[b];
      let e = 0;
      const w = f.weights;
      const s = f.start;
      for (let i = 0; i < w.length; i++) e += power[s + i] * w[i];
      const l = Math.log(1 + mu * e);
      curLog[b] = l;
      logSpec[t * bands + b] = l;
      const d = l - prevLog[b];
      const dpos = d > 0 ? d : 0;
      fAll += dpos;
      const g = groupOf[b];
      if (g === 0) {
        eL += e;
        fL += dpos;
      } else if (g === 1) {
        eM += e;
        fM += dpos;
      } else if (g === 2) {
        eH += e;
        fH += dpos;
      }
    }
    prevLog.set(curLog);
    energyLow[t] = eL;
    energyMid[t] = eM;
    energyHigh[t] = eH;
    fluxRaw[t] = t === 0 ? 0 : fAll;
    fluxLow[t] = t === 0 ? 0 : fL;
    fluxMid[t] = t === 0 ? 0 : fM;
    fluxHigh[t] = t === 0 ? 0 : fH;
    if (onProgress && t % progressEvery === 0) onProgress(t / frameCount);
  }

  // Onset envelope: light smoothing, remove slow trend, rectify, normalise.
  const smoothed = gaussianSmooth(fluxRaw, 1);
  const trend = movingAverage(smoothed, Math.round(0.5 / frameDur));
  const flux = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const v = smoothed[i] - trend[i];
    flux[i] = v > 0 ? v : 0;
  }
  const scale = percentile(flux, 0.98) || 1;
  for (let i = 0; i < frameCount; i++) flux[i] /= scale;

  const smoothGroup = (x: Float32Array) => gaussianSmooth(x, 0.8);

  onProgress?.(1);
  return {
    sampleRate,
    fftSize,
    hop,
    frameDur,
    frameCount,
    bandCount: bands,
    bandHz: centers,
    logSpec,
    flux,
    fluxLow: smoothGroup(fluxLow),
    fluxMid: smoothGroup(fluxMid),
    fluxHigh: smoothGroup(fluxHigh),
    rms,
    energyLow,
    energyMid,
    energyHigh,
  };
}
