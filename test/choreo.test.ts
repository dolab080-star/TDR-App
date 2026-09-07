import { describe, expect, it } from 'vitest';
import { BPM, choreograph, STATIC_STATE, type LampState } from '../src/lib/car3d/choreo';

const KEYS: (keyof LampState)[] = ['bar', 'headL', 'headR', 'turnL', 'turnR', 'tail', 'brake', 'reverse', 'port', 'portHue', 'mirrorFold', 'windows', 'trunk'];

function sample(seconds = 60, step = 0.02): LampState[] {
  const out: LampState[] = [];
  for (let t = 0; t < seconds; t += step) out.push(choreograph(t));
  return out;
}

describe('marketing car choreography', () => {
  const frames = sample();
  const max = (key: keyof LampState) => Math.max(...frames.map((f) => f[key]));
  const min = (key: keyof LampState) => Math.min(...frames.map((f) => f[key]));

  it('keeps every lamp and opening within 0..1 and the bounce small', () => {
    for (const s of frames) {
      for (const key of KEYS) {
        expect(Number.isFinite(s[key]), key).toBe(true);
        expect(s[key], key).toBeGreaterThanOrEqual(0);
        expect(s[key], key).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(s.bob)).toBeLessThanOrEqual(0.025);
    }
  });

  it('uses every lamp, folds the mirrors, and opens and closes the windows and liftgate', () => {
    for (const key of ['bar', 'headL', 'headR', 'turnL', 'turnR', 'tail', 'brake', 'reverse', 'port'] as const) expect(max(key), key).toBeGreaterThan(0.5);
    expect(max('mirrorFold')).toBe(1);
    expect(max('windows')).toBeGreaterThan(0.95);
    expect(min('windows')).toBe(0);
    expect(max('trunk')).toBe(1);
    expect(min('trunk')).toBe(0);
  });

  it('runs the windows, liftgate and mirrors one after another, not on top of each other', () => {
    for (const s of frames) {
      expect(Math.min(s.trunk, s.mirrorFold)).toBeLessThan(0.5);
      expect(Math.min(s.trunk, s.windows)).toBeLessThan(0.5);
    }
  });

  it('alternates turn signals rather than lighting both at once', () => {
    for (const s of frames) expect(Math.min(s.turnL, s.turnR)).toBeLessThan(0.5);
  });

  it('repeats every 32 beats and is safe at negative time', () => {
    const bar = (60 / BPM) * 32;
    expect(choreograph(3.3).bar).toBeCloseTo(choreograph(3.3 + bar).bar, 6);
    expect(choreograph(-5).bar).toBe(choreograph(0).bar);
    expect(STATIC_STATE.trunk).toBe(0);
  });
});
