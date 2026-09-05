import { describe, expect, it } from 'vitest';
import { generateShow } from '../src/lib/show/generator';
import { encodeFseq } from '../src/lib/tesla/fseq';
import { validateFseq } from '../src/lib/tesla/validator';
import { CH, CLOSURE, CLOSURE_LIMITS } from '../src/lib/tesla/channels';
import { DEFAULT_VEHICLE, type VehicleConfig } from '../src/lib/tesla/vehicles';
import { DEFAULT_CLOSURES, type ClosureOptions } from '../src/lib/show/types';
import { makeAnalysis } from './helpers';

const none = (): ClosureOptions => {
  const out = {} as ClosureOptions;
  for (const k of Object.keys(DEFAULT_CLOSURES) as (keyof ClosureOptions)[]) out[k] = { ...DEFAULT_CLOSURES[k], enabled: false } as never;
  return out;
};
const modelX: VehicleConfig = { ...DEFAULT_VEHICLE, model: 'model-x', year: 2024 };
const modelS: VehicleConfig = { ...DEFAULT_VEHICLE, model: 'model-s', year: 2024 };

/** Times (s) at which a channel takes a given value (first frame of each run). */
function transitionsTo(frames: Uint8Array, frameCount: number, ch: number, value: number): number[] {
  const out: number[] = [];
  let prev = -1;
  for (let f = 0; f < frameCount; f++) {
    const v = frames[f * 48 + ch - 1];
    if (v === value && prev !== value) out.push(f / 50);
    prev = v;
  }
  return out;
}

describe('closure choreography', () => {
  it('places custom mirror cues and unfolds after the hold', () => {
    const a = makeAnalysis(90, 120);
    const show = generateShow(a, { closures: { ...none(), mirrors: { enabled: true, trigger: 'custom', customTimes: [10, 30, 50], holdSeconds: 4, maxMoves: 10 } } });
    const folds = transitionsTo(show.frames, show.frameCount, CH.mirrorL, CLOSURE.close);
    const unfolds = transitionsTo(show.frames, show.frameCount, CH.mirrorL, CLOSURE.open);
    expect(folds.map((t) => Math.round(t))).toEqual([10, 30, 50]);
    expect(unfolds.map((t) => Math.round(t))).toEqual([14, 34, 54]);
    const report = validateFseq(encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(report.closureCommands[CH.mirrorL]).toBe(6);
    expect(show.warnings.some((w) => /Mirrors/.test(w))).toBe(false);
  });

  it('caps mirror moves and reports it', () => {
    const a = makeAnalysis(90, 120);
    const times = [5, 15, 25, 35, 45];
    const show = generateShow(a, { closures: { ...none(), mirrors: { enabled: true, trigger: 'custom', customTimes: times, holdSeconds: 4, maxMoves: 2 } } });
    expect(transitionsTo(show.frames, show.frameCount, CH.mirrorL, CLOSURE.close)).toHaveLength(2);
    expect(show.warnings.some((w) => /Mirrors: limited to 2/.test(w))).toBe(true);
  });

  it('never exceeds the per-window command limit', () => {
    const a = makeAnalysis(200, 120, ['high', 'high', 'high', 'high', 'high', 'high']);
    const show = generateShow(a, {
      closures: { ...none(), windows: { enabled: true, which: 'all', trigger: 'custom', customTimes: [5, 30, 55, 80, 105, 130, 155], danceSeconds: 10, closeAfter: true, stagger: true } },
    });
    const report = validateFseq(encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 }));
    for (const ch of [CH.windowFrontL, CH.windowRearL, CH.windowFrontR, CH.windowRearR]) {
      expect(report.closureCommands[ch]).toBeLessThanOrEqual(CLOSURE_LIMITS.windows);
    }
    expect(report.ok).toBe(true);
    expect(show.warnings.some((w) => /Windows: limited to 3/.test(w))).toBe(true);
    // stagger: front-right starts 0.3 s after front-left, rear-left 0.6 s after
    const fl = transitionsTo(show.frames, show.frameCount, CH.windowFrontL, CLOSURE.dance)[0];
    const fr = transitionsTo(show.frames, show.frameCount, CH.windowFrontR, CLOSURE.dance)[0];
    const rl = transitionsTo(show.frames, show.frameCount, CH.windowRearL, CLOSURE.dance)[0];
    expect(fr - fl).toBeCloseTo(0.3, 1);
    expect(rl - fl).toBeCloseTo(0.6, 1);
  });

  it('skips a liftgate that cannot open and close within the song', () => {
    const a = makeAnalysis(30, 120, ['mid', 'high']);
    const show = generateShow(a, { closures: { ...none(), liftgate: { ...DEFAULT_CLOSURES.liftgate, enabled: true, openAt: 'custom', openTime: 20 } } });
    expect(transitionsTo(show.frames, show.frameCount, CH.liftgate, CLOSURE.open)).toHaveLength(0);
    expect(show.warnings.some((w) => /Liftgate: not enough time/.test(w))).toBe(true);
  });

  it('dances the liftgate only once it has had time to open, then closes', () => {
    const a = makeAnalysis(120, 120, ['low', 'high', 'mid', 'high']);
    const show = generateShow(a, {
      closures: { ...none(), liftgate: { ...DEFAULT_CLOSURES.liftgate, enabled: true, openAt: 'start', dance: 'everyHigh', danceSeconds: 10, closeAt: 'end' } },
    });
    const opens = transitionsTo(show.frames, show.frameCount, CH.liftgate, CLOSURE.open);
    const dances = transitionsTo(show.frames, show.frameCount, CH.liftgate, CLOSURE.dance);
    const closes = transitionsTo(show.frames, show.frameCount, CH.liftgate, CLOSURE.close);
    expect(opens).toHaveLength(1);
    expect(dances.length).toBeGreaterThanOrEqual(1);
    for (const d of dances) expect(d - opens[0]).toBeGreaterThanOrEqual(15);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toBeLessThanOrEqual(120 - 4);
    expect(closes[0]).toBeGreaterThan(dances[dances.length - 1]);
  });

  it('refuses closures the vehicle does not have and explains why', () => {
    const a = makeAnalysis(90, 120);
    const on3 = generateShow(a, {
      vehicle: { ...DEFAULT_VEHICLE, model: 'model-3', year: 2019, powerLiftgate: false },
      closures: { ...none(), doorHandles: { ...DEFAULT_CLOSURES.doorHandles, enabled: true }, falconDoors: { ...DEFAULT_CLOSURES.falconDoors, enabled: true }, liftgate: { ...DEFAULT_CLOSURES.liftgate, enabled: true } },
    });
    for (let f = 0; f < on3.frameCount; f++) {
      for (const ch of [CH.doorHandleFrontL, CH.falconDoorL, CH.liftgate]) expect(on3.frames[f * 48 + ch - 1]).toBe(0);
    }
    expect(on3.warnings.some((w) => /Door handles: only Model S/.test(w))).toBe(true);
    expect(on3.warnings.some((w) => /Falcon doors: only Model X/.test(w))).toBe(true);
    expect(on3.warnings.some((w) => /Liftgate: not available/.test(w))).toBe(true);

    const onX = generateShow(a, { vehicle: modelX, closures: { ...none(), falconDoors: { ...DEFAULT_CLOSURES.falconDoors, enabled: true, dance: 'loudest' } } });
    const opens = transitionsTo(onX.frames, onX.frameCount, CH.falconDoorL, CLOSURE.open);
    expect(opens).toHaveLength(1);
    const dances = transitionsTo(onX.frames, onX.frameCount, CH.falconDoorL, CLOSURE.dance);
    for (const d of dances) expect(d - opens[0]).toBeGreaterThanOrEqual(21);

    const onS = generateShow(a, { vehicle: modelS, closures: { ...none(), doorHandles: { enabled: true, trigger: 'custom', customTimes: [20, 40], holdSeconds: 4 } } });
    expect(transitionsTo(onS.frames, onS.frameCount, CH.doorHandleFrontL, CLOSURE.open).map(Math.round)).toEqual([20, 40]);
  });

  it('closes the charge port before its two-minute auto-close on long songs', () => {
    const a = makeAnalysis(200, 120, ['mid', 'high', 'mid']);
    const show = generateShow(a, { closures: { ...none(), chargePort: { ...DEFAULT_CLOSURES.chargePort, enabled: true } } });
    const opens = transitionsTo(show.frames, show.frameCount, CH.chargePort, CLOSURE.open);
    const closes = transitionsTo(show.frames, show.frameCount, CH.chargePort, CLOSURE.close);
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
    expect(closes[0] - opens[0]).toBeLessThanOrEqual(115.1);
    expect(closes[0] - opens[0]).toBeGreaterThan(100);
  });
});
