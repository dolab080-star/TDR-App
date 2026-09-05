/**
 * Peak picking for onset detection (librosa-style adaptive threshold).
 */
export interface PeakPickOptions {
  /** Frames before/after in which the sample must be the maximum. */
  preMax: number;
  postMax: number;
  /** Frames before/after used for the local mean threshold. */
  preAvg: number;
  postAvg: number;
  /** Amount above the local mean the sample must be. */
  delta: number;
  /** Minimum frames between successive peaks. */
  wait: number;
}

export function pickPeaks(x: Float32Array, o: PeakPickOptions): number[] {
  const n = x.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];
  const peaks: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    if (v <= 0) continue;
    if (i - last <= o.wait) continue;
    // local max
    const a = Math.max(0, i - o.preMax);
    const b = Math.min(n - 1, i + o.postMax);
    let isMax = true;
    for (let j = a; j <= b; j++) {
      if (x[j] > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const c = Math.max(0, i - o.preAvg);
    const d = Math.min(n, i + o.postAvg + 1);
    const mean = (prefix[d] - prefix[c]) / (d - c);
    if (v >= mean + o.delta) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

export interface Onset {
  /** Seconds. */
  time: number;
  /** 0..1 relative strength. */
  strength: number;
}

/**
 * Detect onsets in a group-flux envelope. `minGapS` is the minimum spacing.
 * Strengths are normalised so the 95th percentile peak is 1.
 */
export function detectOnsets(env: Float32Array, frameDur: number, minGapS: number, sensitivity = 1): Onset[] {
  const n = env.length;
  if (n === 0) return [];
  // Normalise envelope for a scale-free delta.
  const sorted = Array.from(env).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (n - 1))] || 1;
  const scaled = new Float32Array(n);
  for (let i = 0; i < n; i++) scaled[i] = env[i] / p95;
  const wait = Math.max(1, Math.round(minGapS / frameDur));
  const peaks = pickPeaks(scaled, {
    preMax: Math.max(1, Math.round(0.03 / frameDur)),
    postMax: Math.max(1, Math.round(0.03 / frameDur)),
    preAvg: Math.max(2, Math.round(0.1 / frameDur)),
    postAvg: Math.max(2, Math.round(0.1 / frameDur)),
    delta: 0.12 / sensitivity,
    wait,
  });
  return peaks.map((i) => ({ time: i * frameDur, strength: Math.min(1, scaled[i]) }));
}
