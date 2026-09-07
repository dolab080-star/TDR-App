import { describe, expect, it } from 'vitest';
import { choreograph, PACE_BPM, STATIC_STATE, type LampState, type Pace } from '../src/lib/car3d/choreo';

const PACES: Pace[] = ['chill', 'standard', 'max'];
const LAMPS: (keyof LampState)[] = ['bar', 'headL', 'headR', 'turnL', 'turnR', 'tail', 'brake', 'reverse', 'port', 'portHue', 'mirrorFold'];

function sample(pace: Pace, seconds = 40, step = 0.02): LampState[] {
  const out: LampState[] = [];
  for (let t = 0; t < seconds; t += step) out.push(choreograph(pace, t));
  return out;
}

describe('marketing car choreography', () => {
  it('keeps every lamp and fold value within 0..1 and motion small', () => {
    for (const pace of PACES) {
      for (const s of sample(pace)) {
        for (const key of LAMPS) {
          const v = s[key];
          expect(Number.isFinite(v), `${pace} ${key}`).toBe(true);
          expect(v, `${pace} ${key}`).toBeGreaterThanOrEqual(0);
          expect(v, `${pace} ${key}`).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(s.bob)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(s.roll)).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('uses every lamp at least once per pace', () => {
    for (const pace of PACES) {
      const frames = sample(pace, 60);
      for (const key of ['bar', 'headL', 'headR', 'turnL', 'turnR', 'tail', 'brake', 'port'] as const) {
        expect(Math.max(...frames.map((f) => f[key])), `${pace} ${key}`).toBeGreaterThan(0.5);
      }
      expect(Math.max(...frames.map((f) => f.mirrorFold)), `${pace} mirrors`).toBe(1);
    }
  });

  it('gets busier from chill to max', () => {
    const flips = (pace: Pace) => {
      const frames = sample(pace, 30);
      let n = 0;
      for (let i = 1; i < frames.length; i++) if (frames[i].bar > 0.6 !== frames[i - 1].bar > 0.6) n++;
      return n;
    };
    expect(flips('chill')).toBeLessThan(flips('standard'));
    expect(flips('standard')).toBeLessThan(flips('max'));
    expect(PACE_BPM.chill).toBeLessThan(PACE_BPM.standard);
    expect(PACE_BPM.standard).toBeLessThan(PACE_BPM.max);
  });

  it('alternates turn signals rather than lighting both at once (chill and standard)', () => {
    for (const pace of ['chill', 'standard'] as const) {
      for (const s of sample(pace, 20)) expect(Math.min(s.turnL, s.turnR), pace).toBeLessThan(0.5);
    }
  });

  it('is deterministic and safe at negative time', () => {
    expect(choreograph('max', 12.34)).toEqual(choreograph('max', 12.34));
    expect(choreograph('standard', -5).bar).toBe(choreograph('standard', 0).bar);
    expect(STATIC_STATE.bar).toBeGreaterThan(0);
  });
});
