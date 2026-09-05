/**
 * Coarse musical structure: split the song into sections at bar boundaries
 * using a Foote-style novelty curve over bar-level features, then label each
 * section by relative energy (low / mid / high) and detect builds.
 */
import type { Features } from './features';

export type SectionTier = 'low' | 'mid' | 'high';

export interface Section {
  index: number;
  startTime: number;
  endTime: number;
  startBar: number;
  endBar: number;
  tier: SectionTier;
  /** 0..1 loudness relative to the rest of the song. */
  energy: number;
  /** True when loudness ramps up into a louder following section. */
  build: boolean;
}

interface BarFeature {
  vec: Float32Array;
  db: number;
  density: number;
}

function barFeatures(barTimes: number[], endTime: number, f: Features): BarFeature[] {
  const out: BarFeature[] = [];
  const groups = 10;
  const per = Math.max(1, Math.floor(f.bandCount / groups));
  for (let i = 0; i < barTimes.length; i++) {
    const t0 = barTimes[i];
    const t1 = i + 1 < barTimes.length ? barTimes[i + 1] : endTime;
    const a = Math.max(0, Math.floor(t0 / f.frameDur));
    const b = Math.min(f.frameCount, Math.max(a + 1, Math.floor(t1 / f.frameDur)));
    const vec = new Float32Array(groups + 2);
    let rmsSum = 0;
    let dens = 0;
    for (let t = a; t < b; t++) {
      for (let g = 0; g < groups; g++) {
        let s = 0;
        for (let k = 0; k < per; k++) s += f.logSpec[t * f.bandCount + g * per + k];
        vec[g] += s / per;
      }
      rmsSum += f.rms[t];
      dens += f.flux[t];
    }
    const n = b - a;
    for (let g = 0; g < groups; g++) vec[g] /= n;
    const db = 20 * Math.log10(rmsSum / n + 1e-6);
    vec[groups] = db;
    vec[groups + 1] = dens / n;
    out.push({ vec, db, density: dens / n });
  }
  // z-score each dimension
  const dims = groups + 2;
  for (let d = 0; d < dims; d++) {
    let m = 0;
    for (const bf of out) m += bf.vec[d];
    m /= out.length;
    let v = 0;
    for (const bf of out) v += (bf.vec[d] - m) ** 2;
    const sd = Math.sqrt(v / out.length) || 1;
    const w = d === groups ? 1.5 : 1;
    for (const bf of out) bf.vec[d] = (w * (bf.vec[d] - m)) / sd;
  }
  return out;
}

function novelty(bars: BarFeature[]): Float32Array {
  const n = bars.length;
  const nov = new Float32Array(n + 1);
  if (n < 4) return nov;
  const dist = (a: number, b: number) => {
    let s = 0;
    const va = bars[a].vec;
    const vb = bars[b].vec;
    for (let i = 0; i < va.length; i++) s += (va[i] - vb[i]) ** 2;
    return Math.sqrt(s);
  };
  // similarity kernel width = median pairwise distance
  const ds: number[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) ds.push(dist(a, b));
  ds.sort((x, y) => x - y);
  const sigma = ds[Math.floor(ds.length / 2)] || 1;
  const S = new Float32Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const d = a === b ? 0 : dist(a, b);
      S[a * n + b] = Math.exp(-(d * d) / (2 * sigma * sigma));
    }
  }
  const K = Math.max(2, Math.min(4, Math.floor(n / 4)));
  for (let i = 1; i < n; i++) {
    let acc = 0;
    let count = 0;
    for (let m = 0; m < K; m++) {
      for (let l = 0; l < K; l++) {
        const a1 = i - 1 - m;
        const a2 = i - 1 - l;
        const b1 = i + m;
        const b2 = i + l;
        if (a1 < 0 || a2 < 0 || b1 >= n || b2 >= n) continue;
        acc += S[a1 * n + a2] + S[b1 * n + b2] - S[a1 * n + b2] - S[b1 * n + a2];
        count++;
      }
    }
    nov[i] = count > 0 ? Math.max(0, acc / count) : 0;
  }
  return nov;
}

export interface SegmentOptions {
  /** Minimum section length in bars. */
  minBars?: number;
}

export function segmentSections(barTimes: number[], endTime: number, f: Features, o: SegmentOptions = {}): Section[] {
  const minBars = o.minBars ?? 4;
  const nBars = barTimes.length;
  if (nBars === 0) {
    return [{ index: 0, startTime: 0, endTime, startBar: 0, endBar: 0, tier: 'mid', energy: 0.5, build: false }];
  }
  const bars = barFeatures(barTimes, endTime, f);
  const nov = novelty(bars);

  // Peak-pick the novelty curve.
  const boundaries: number[] = [0];
  if (nBars >= 2 * minBars) {
    let mean = 0;
    let count = 0;
    for (let i = 1; i < nBars; i++) {
      mean += nov[i];
      count++;
    }
    mean /= Math.max(1, count);
    let v = 0;
    for (let i = 1; i < nBars; i++) v += (nov[i] - mean) ** 2;
    const sd = Math.sqrt(v / Math.max(1, count));
    const thr = mean + 0.4 * sd;
    const cands: number[] = [];
    for (let i = minBars; i <= nBars - minBars; i++) {
      let isMax = true;
      for (let j = Math.max(1, i - 3); j <= Math.min(nBars - 1, i + 3); j++) {
        if (nov[j] > nov[i]) {
          isMax = false;
          break;
        }
      }
      if (isMax && nov[i] >= thr) cands.push(i);
    }
    // Enforce min distance greedily by novelty strength.
    cands.sort((a, b) => nov[b] - nov[a]);
    const chosen: number[] = [];
    for (const c of cands) {
      if (chosen.every((x) => Math.abs(x - c) >= minBars)) chosen.push(c);
    }
    chosen.sort((a, b) => a - b);
    boundaries.push(...chosen);
  }
  boundaries.push(nBars);

  // Build sections.
  const sections: Section[] = [];
  const barDb = bars.map((b) => b.db);
  for (let s = 0; s + 1 < boundaries.length; s++) {
    const b0 = boundaries[s];
    const b1 = boundaries[s + 1];
    sections.push({
      index: s,
      startTime: barTimes[b0],
      endTime: b1 < nBars ? barTimes[b1] : endTime,
      startBar: b0,
      endBar: b1,
      tier: 'high',
      energy: 1,
      build: false,
    });
  }

  // Classify by dynamics *relative to the song*, so compressed masters still
  // get contrast between their sections. Loudness decides when the song has
  // real dynamics; otherwise rhythmic density does.
  const mean = (arr: number[], a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += arr[i];
    return s / Math.max(1, b - a);
  };
  const secDb = sections.map((sec) => mean(barDb, sec.startBar, sec.endBar));
  const secDens = sections.map((sec) => mean(bars.map((b) => b.density), sec.startBar, sec.endBar));
  const minDb = Math.min(...secDb);
  const maxDb = Math.max(...secDb);
  const range = maxDb - minDb;
  if (sections.length > 1 && range >= 2) {
    sections.forEach((sec, i) => {
      const e = (secDb[i] - minDb) / range;
      sec.energy = e;
      let tier: SectionTier = 'mid';
      if (e >= 0.6) tier = 'high';
      else if (e <= 0.3 && maxDb - secDb[i] >= 4) tier = 'low';
      sec.tier = tier;
    });
  } else if (sections.length > 1) {
    const sortedDens = [...secDens].sort((a, b) => a - b);
    const median = sortedDens[Math.floor(sortedDens.length / 2)];
    const minD = sortedDens[0];
    const maxD = sortedDens[sortedDens.length - 1];
    sections.forEach((sec, i) => {
      sec.energy = maxD - minD > 1e-6 ? 0.5 + 0.5 * ((secDens[i] - minD) / (maxD - minD)) : 0.75;
      sec.tier = secDens[i] >= median ? 'high' : 'mid';
    });
  }

  // Builds: loudness rising over the tail of a section that leads into a louder one.
  for (let i = 0; i + 1 < sections.length; i++) {
    const sec = sections[i];
    const next = sections[i + 1];
    if (next.energy <= sec.energy + 0.1) continue;
    const len = sec.endBar - sec.startBar;
    const n = Math.min(8, len);
    if (n < 3) continue;
    const start = sec.endBar - n;
    // least squares slope of dB vs bar
    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k++) {
      const y = barDb[start + k];
      sx += k;
      sy += y;
      sxy += k * y;
      sxx += k * k;
    }
    const slope = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx);
    if (slope > 0.2) sec.build = true;
  }

  // Ensure the first section starts at 0 so the whole song is covered.
  if (sections.length) {
    sections[0].startTime = 0;
    sections[sections.length - 1].endTime = endTime;
  }
  return sections;
}
