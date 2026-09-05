import { describe, expect, it } from 'vitest';
import { analyze } from '../src/lib/audio/analyze';
import { synthDemoTrack } from '../src/lib/demo/synthDemo';

/** Simple drum-machine track: kick on every beat, snare on 2 & 4, hats on 8ths. */
function drumTrack(bpm: number, seconds: number, sampleRate: number, offset = 0.25): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const x = new Float32Array(n);
  const beat = 60 / bpm;
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  let k = 0;
  for (let t = offset; t < seconds; t += beat, k++) {
    const i0 = Math.floor(t * sampleRate);
    for (let i = 0; i < 0.25 * sampleRate && i0 + i < n; i++) {
      const tt = i / sampleRate;
      x[i0 + i] += Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 10) * 0.9;
    }
    if (k % 2 === 1) {
      for (let i = 0; i < 0.12 * sampleRate && i0 + i < n; i++) x[i0 + i] += rnd() * Math.exp(-(i / sampleRate) * 30) * 0.8;
    }
    const h0 = Math.floor((t + beat / 2) * sampleRate);
    for (let i = 0; i < 0.04 * sampleRate && h0 + i < n; i++) x[h0 + i] += rnd() * Math.exp(-(i / sampleRate) * 90) * 0.3;
  }
  return x;
}

describe('analyze', () => {
  it('finds the tempo and beat positions of a drum track', () => {
    const sr = 22050;
    const bpm = 128;
    const x = drumTrack(bpm, 30, sr);
    const a = analyze(x, sr);
    expect(Math.abs(a.bpm - bpm)).toBeLessThan(1.5);
    const tracked = a.beats.filter((b) => !b.inferred);
    expect(tracked.length).toBeGreaterThan(40);
    const period = 60 / bpm;
    let aligned = 0;
    for (const b of tracked) {
      const phase = ((b.time - 0.25) % period + period) % period;
      const err = Math.min(phase, period - phase);
      if (err < 0.035) aligned++;
    }
    expect(aligned / tracked.length).toBeGreaterThan(0.85);
    // Kick onsets should be detected on most beats.
    expect(a.onsets.low.length).toBeGreaterThan(tracked.length * 0.8);
    expect(a.sections.length).toBeGreaterThanOrEqual(1);
    expect(a.loudness.length).toBe(Math.ceil(30 * 50));
    expect(a.firstSound).toBeLessThan(0.4);
  });

  it('analyses the built-in demo track sensibly', () => {
    const demo = synthDemoTrack(22050);
    const mono = new Float32Array(demo.left.length);
    for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (demo.left[i] + demo.right[i]);
    const a = analyze(mono, demo.sampleRate);
    expect(Math.abs(a.bpm - demo.bpm)).toBeLessThan(2);
    expect(a.sections.length).toBeGreaterThanOrEqual(3);
    expect(a.sections.some((s) => s.tier === 'high')).toBe(true);
    expect(a.sections.some((s) => s.tier !== 'high')).toBe(true);
    expect(a.bars.length).toBeGreaterThan(15);
  });

  it('copes with silence', () => {
    const a = analyze(new Float32Array(22050 * 5), 22050);
    expect(a.duration).toBeCloseTo(5, 3);
    expect(Number.isFinite(a.bpm)).toBe(true);
    expect(a.sections.length).toBeGreaterThanOrEqual(1);
  });
});
