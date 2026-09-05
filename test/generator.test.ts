import { describe, expect, it } from 'vitest';
import { generateShow } from '../src/lib/show/generator';
import { encodeFseq } from '../src/lib/tesla/fseq';
import { validateFseq } from '../src/lib/tesla/validator';
import { CLOSURE_CHANNELS, CLOSURE_VALUES, LIGHT_CHANNELS, LIGHT_VALUES, CH, CLOSURE } from '../src/lib/tesla/channels';
import { DEFAULT_VEHICLE, type VehicleConfig, type VehicleModel } from '../src/lib/tesla/vehicles';
import { makeAnalysis } from './helpers';
import { DEFAULT_CLOSURES, type ClosureOptions, type StylePreset } from '../src/lib/show/types';

export function allClosures(enabled: boolean, extra: Partial<Record<keyof ClosureOptions, object>> = {}): ClosureOptions {
  const out = {} as ClosureOptions;
  for (const key of Object.keys(DEFAULT_CLOSURES) as (keyof ClosureOptions)[]) {
    out[key] = { ...DEFAULT_CLOSURES[key], enabled, ...(extra[key] ?? {}) } as never;
  }
  // The "everyHigh" modes exercise the limits harder than the defaults.
  if (enabled) {
    out.liftgate = { ...out.liftgate, dance: 'everyHigh' };
    out.falconDoors = { ...out.falconDoors, dance: 'everyHigh' };
    out.windows = { ...out.windows, trigger: 'everyHigh' };
  }
  return out;
}

const NONE = allClosures(false);
const vehicle = (model: VehicleModel, patch: Partial<VehicleConfig> = {}): VehicleConfig => ({ ...DEFAULT_VEHICLE, model, year: 2024, ...patch });

describe('generateShow', () => {
  const styles: StylePreset[] = ['balanced', 'energetic', 'chill'];
  const models: VehicleModel[] = ['model-s', 'model-3', 'model-x', 'model-y', 'cybertruck'];

  for (const style of styles) {
    for (const model of models) {
      it(`produces a valid show (${style}, ${model}, every closure on)`, () => {
        const a = makeAnalysis(120, 128, ['low', 'mid', 'high', 'mid', 'high', 'low']);
        const show = generateShow(a, { style, intensity: 0.8, vehicle: vehicle(model), closures: allClosures(true) });
        expect(show.frameCount).toBe(Math.ceil(120 * 50));
        expect(show.frames.length).toBe(show.frameCount * 48);
        const report = validateFseq(encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 }));
        expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.issues.filter((i) => i.level === 'warning')).toEqual([]);
        for (const u of report.closureUsage) expect(u.used).toBeLessThanOrEqual(u.limit);
      });
    }
  }

  it('only emits legal value codes and keeps spare channels dark', () => {
    const a = makeAnalysis(60, 100);
    const show = generateShow(a, { intensity: 1, vehicle: vehicle('model-x'), closures: allClosures(true) });
    for (let f = 0; f < show.frameCount; f++) {
      const row = show.frames.subarray(f * 48, (f + 1) * 48);
      for (const ch of LIGHT_CHANNELS) expect(LIGHT_VALUES.has(row[ch - 1])).toBe(true);
      for (const ch of CLOSURE_CHANNELS) expect(CLOSURE_VALUES.has(row[ch - 1])).toBe(true);
      expect(row[46]).toBe(0);
      expect(row[47]).toBe(0);
    }
    expect(Array.from(show.frames.subarray((show.frameCount - 1) * 48))).toEqual(new Array(48).fill(0));
  });

  it('actually lights things up and follows the music', () => {
    const a = makeAnalysis(60, 120);
    const show = generateShow(a, { closures: NONE });
    let lit = 0;
    for (let f = 0; f < show.frameCount; f++) {
      for (const ch of LIGHT_CHANNELS) if (show.frames[f * 48 + ch - 1] >= 128) lit++;
    }
    const ratio = lit / (show.frameCount * LIGHT_CHANNELS.length);
    expect(ratio).toBeGreaterThan(0.03);
    expect(ratio).toBeLessThan(0.6);
    const high = a.sections.find((s) => s.tier === 'high')!;
    const kick = a.onsets.low.find((o) => o.time > high.startTime + 2)!;
    const f = Math.round(kick.time * 50);
    expect(show.frames[f * 48 + CH.brakeLights - 1]).toBe(255);
    expect(show.events.some((e) => e.kind === 'drop' && Math.abs(e.time - high.startTime) < 0.01)).toBe(true);
    expect(show.events.some((e) => e.kind === 'ending')).toBe(true);
  });

  it('respects closure toggles and the open-before-dance rule', () => {
    const a = makeAnalysis(60, 120);
    const off = generateShow(a, { closures: NONE });
    for (let f = 0; f < off.frameCount; f++) {
      for (const ch of CLOSURE_CHANNELS) expect(off.frames[f * 48 + ch - 1]).toBe(0);
    }
    const cp = generateShow(a, { closures: { ...NONE, chargePort: { ...DEFAULT_CLOSURES.chargePort, enabled: true } } });
    const values = new Set<number>();
    let firstOpen = -1;
    let firstDance = -1;
    for (let f = 0; f < cp.frameCount; f++) {
      const v = cp.frames[f * 48 + CH.chargePort - 1];
      values.add(v);
      if (v === CLOSURE.open && firstOpen < 0) firstOpen = f;
      if (v === CLOSURE.dance && firstDance < 0) firstDance = f;
    }
    expect(values.has(CLOSURE.open)).toBe(true);
    expect(values.has(CLOSURE.dance)).toBe(true);
    expect(values.has(CLOSURE.close)).toBe(true);
    expect(firstDance - firstOpen).toBeGreaterThanOrEqual(100);
    // Doors are never commanded unless explicitly enabled on a Model X.
    for (let f = 0; f < cp.frameCount; f++) {
      for (const ch of [CH.falconDoorL, CH.falconDoorR, CH.frontDoorL, CH.frontDoorR]) expect(cp.frames[f * 48 + ch - 1]).toBe(0);
    }
  });

  it('keeps lights the vehicle lacks dark and moves roles elsewhere', () => {
    const a = makeAnalysis(60, 120, ['mid', 'high']);
    const ct = generateShow(a, { vehicle: vehicle('cybertruck'), closures: NONE });
    for (let f = 0; f < ct.frameCount; f++) {
      for (const ch of [CH.signatureL, CH.signatureR, CH.rearTurnL, CH.rearTurnR, CH.frontFogL, CH.frontFogR, CH.channel4L, CH.channel6R]) {
        expect(ct.frames[f * 48 + ch - 1]).toBe(0);
      }
    }
    expect(ct.warnings.some((w) => /signature/i.test(w))).toBe(true);
    let repeaterOn = 0;
    for (let f = 0; f < ct.frameCount; f++) if (ct.frames[f * 48 + CH.sideRepeaterL - 1] === 255) repeaterOn++;
    expect(repeaterOn).toBeGreaterThan(0);

    const sr = generateShow(a, { vehicle: vehicle('model-3', { standardRange: true, region: 'row' }), closures: NONE });
    for (let f = 0; f < sr.frameCount; f++) {
      for (const ch of [CH.frontFogL, CH.auxParkL, CH.sideMarkerR]) expect(sr.frames[f * 48 + ch - 1]).toBe(0);
    }
  });

  it('handles very short and beatless input', () => {
    const a = makeAnalysis(3, 120, ['mid']);
    a.beats = [];
    a.bars = [];
    a.sections = [];
    const show = generateShow(a, { closures: allClosures(true) });
    expect(show.frameCount).toBe(150);
    const report = validateFseq(encodeFseq(show.frames, { channelCount: 48, stepTimeMs: 20 }));
    expect(report.ok).toBe(true);
  });
});
