/**
 * Turns an AnalysisResult into 48-channel light show frames.
 *
 * The song is walked section by section. Each section gets a "program" based
 * on its energy tier (low / mid / high) that assigns every light group a
 * musical role (kick, snare, hats, beat chase, bar accents, ambient glow).
 * Builds, drops and the ending get special treatment on top.
 *
 * Design rules baked in (from Tesla's README):
 * - only emit xLights on/off/ramp codes;
 * - keep on/off times >= 100 ms where the eye should notice them (fast
 *   hi-hat layers use >= 60 ms, still far above the 15 ms hardware minimum);
 * - treat Aux Park + Side Markers as one group because Model 3/Y OR them;
 * - always write Channel 4 alongside Channels 5/6 because it sets the ramp;
 * - give OR'd groups shared off-time so they visibly flash on every model;
 * - move musical roles off lights the selected vehicle does not have.
 */
import { CH, LIGHT, LIGHT_CHANNELS } from '../tesla/channels';
import { vehicleProfile, type VehicleProfile } from '../tesla/vehicles';
import type { AnalysisResult, Beat } from '../audio/analyze';
import type { Onset } from '../audio/onsets';
import type { Section } from '../audio/sections';
import { FrameBuffer } from './frameBuffer';
import { applyClosures } from './closures';
import { DEFAULT_SHOW_OPTIONS, type GeneratedShow, type ShowEvent, type ShowOptions, type StylePreset } from './types';

// ---- light groups ----------------------------------------------------------
const G = {
  outer: [CH.outerMainBeamL, CH.outerMainBeamR],
  outerL: CH.outerMainBeamL,
  outerR: CH.outerMainBeamR,
  inner: [CH.innerMainBeamL, CH.innerMainBeamR],
  innerL: CH.innerMainBeamL,
  innerR: CH.innerMainBeamR,
  sig: [CH.signatureL, CH.signatureR],
  ambientL: [CH.channel4L, CH.channel5L, CH.channel6L],
  ambientR: [CH.channel4R, CH.channel5R, CH.channel6R],
  ambient: [CH.channel4L, CH.channel5L, CH.channel6L, CH.channel4R, CH.channel5R, CH.channel6R],
  frontTurnL: CH.frontTurnL,
  frontTurnR: CH.frontTurnR,
  frontTurn: [CH.frontTurnL, CH.frontTurnR],
  fog: [CH.frontFogL, CH.frontFogR],
  park: [CH.auxParkL, CH.auxParkR, CH.sideMarkerL, CH.sideMarkerR],
  repL: CH.sideRepeaterL,
  repR: CH.sideRepeaterR,
  rep: [CH.sideRepeaterL, CH.sideRepeaterR],
  rearTurn: [CH.rearTurnL, CH.rearTurnR],
  brake: [CH.brakeLights, CH.rearFogLights],
  tailL: CH.tailL,
  tailR: CH.tailR,
  tail: [CH.tailL, CH.tailR],
  reverse: CH.reverseLights,
  plate: CH.licensePlate,
} as const;

/** Order of lights around the car for chase effects (front-left, clockwise). */
const RING_ALL: readonly number[] = [
  CH.frontTurnL,
  CH.sideRepeaterL,
  CH.rearTurnL,
  CH.tailL,
  CH.tailR,
  CH.rearTurnR,
  CH.sideRepeaterR,
  CH.frontTurnR,
];

/** Which physical lights play which musical role on this vehicle. */
interface Roles {
  hats: readonly [number, number];
  snare: readonly [number, number];
  rearAlt: readonly [number, number];
  park: readonly number[];
  ring: readonly number[];
  accent: readonly number[];
  /** Tails cannot alternate left/right (shared output). */
  tailsCombined: boolean;
  notes: string[];
}

function rolesFor(p: VehicleProfile): Roles {
  const notes: string[] = [];
  const L = p.lights;
  const has = (ch: number) => !p.absentChannels.has(ch);
  let hats: readonly [number, number] = [CH.signatureL, CH.signatureR];
  if (!L.signature.present) {
    hats = [CH.sideRepeaterL, CH.sideRepeaterR];
    notes.push('No signature lights on this vehicle: hi-hat flashes moved to the side repeaters.');
  }
  let snare: readonly [number, number] = [CH.frontFogL, CH.frontFogR];
  if (!L.frontFog.present) {
    snare = [CH.innerMainBeamL, CH.innerMainBeamR];
    notes.push('No front fog lights on this vehicle: snare hits moved to the inner main beams.');
  }
  let rearAlt: readonly [number, number] = [CH.rearTurnL, CH.rearTurnR];
  if (!L.rearTurn.present) {
    rearAlt = [CH.tailL, CH.tailR];
    notes.push(`No rear turn signals on this vehicle: rear alternation uses the ${L.tail.label.toLowerCase()}.`);
  }
  const park = G.park.filter(has);
  const ring = RING_ALL.filter(has);
  const accent = [CH.licensePlate, CH.reverseLights].filter(has);
  return { hats, snare, rearAlt, park, ring, accent, tailsCombined: p.tailsCombined, notes };
}

interface StyleParams {
  beatOn: number;
  thrLow: number;
  thrMid: number;
  thrHigh: number;
  hats: boolean;
  strobeFills: boolean;
  headlightsAlternate: boolean;
  buildStrobes: boolean;
  dropHits: boolean;
  gate: number;
}

function styleParams(style: StylePreset, intensity: number): StyleParams {
  const k = Math.min(1, Math.max(0, intensity));
  const base: StyleParams = {
    beatOn: 0.45,
    thrLow: 0.55 - 0.35 * k,
    thrMid: 0.6 - 0.35 * k,
    thrHigh: 0.7 - 0.4 * k,
    hats: k > 0.35,
    strobeFills: k > 0.5,
    headlightsAlternate: k > 0.45,
    buildStrobes: k > 0.3,
    dropHits: true,
    gate: 0.08,
  };
  if (style === 'energetic') {
    return { ...base, beatOn: 0.4, thrLow: base.thrLow - 0.1, thrMid: base.thrMid - 0.1, thrHigh: base.thrHigh - 0.1, hats: true, strobeFills: true, headlightsAlternate: true, buildStrobes: true };
  }
  if (style === 'chill') {
    return { ...base, beatOn: 0.5, thrLow: base.thrLow + 0.1, thrMid: base.thrMid + 0.15, thrHigh: 1.1, hats: false, strobeFills: false, headlightsAlternate: false, buildStrobes: k > 0.6 };
  }
  return base;
}

// ---- helpers ---------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function onsetsIn(list: Onset[], t0: number, t1: number, thr: number): Onset[] {
  return list.filter((o) => o.time >= t0 && o.time < t1 && o.strength >= thr);
}

/** Drop mid onsets that are really the mid-frequency content of a kick. */
function withoutKicks(mid: Onset[], low: Onset[], tol = 0.045): Onset[] {
  let j = 0;
  return mid.filter((m) => {
    while (j < low.length && low[j].time < m.time - tol) j++;
    const near = low[j] && Math.abs(low[j].time - m.time) <= tol ? low[j] : undefined;
    return !(near && near.strength >= m.strength * 0.8);
  });
}

class Ctx {
  readonly fb: FrameBuffer;
  readonly a: AnalysisResult;
  readonly p: StyleParams;
  readonly r: Roles;
  readonly per: number;
  constructor(fb: FrameBuffer, a: AnalysisResult, p: StyleParams, r: Roles) {
    this.fb = fb;
    this.a = a;
    this.p = p;
    this.r = r;
    this.per = a.beatPeriod;
  }
  loud(t: number): number {
    const i = clamp(Math.floor(t * this.a.fps), 0, this.a.loudness.length - 1);
    return this.a.loudness[i];
  }
  audible(t: number): boolean {
    return this.loud(t) >= this.p.gate;
  }
  beatsIn(s: Section): Beat[] {
    return this.a.beats.filter((b) => b.time >= s.startTime && b.time < s.endTime && this.audible(b.time));
  }
  beatFlash(frac = this.p.beatOn): number {
    return clamp(this.per * frac, 0.1, 0.35);
  }
}

// ---- layers ----------------------------------------------------------------

/** L/R alternation on beats; rear lights mirror or invert the fronts. */
function layerTurnAlternate(c: Ctx, beats: Beat[], invertRear: boolean, includeRepeaters: boolean) {
  const dur = c.beatFlash();
  for (const b of beats) {
    const left = b.index % 2 === 0;
    c.fb.flash(left ? G.frontTurnL : G.frontTurnR, b.time, dur);
    const rearLeft = invertRear ? !left : left;
    if (c.r.tailsCombined && c.r.rearAlt[0] === CH.tailL) c.fb.flash(c.r.rearAlt, b.time, dur);
    else c.fb.flash(rearLeft ? c.r.rearAlt[0] : c.r.rearAlt[1], b.time, dur);
    if (includeRepeaters) c.fb.flash(left ? G.repL : G.repR, b.time, dur);
  }
}

/** Chase one light at a time around the car. */
function layerRingChase(c: Ctx, beats: Beat[], subdiv: number, reverse: boolean) {
  const ring = c.r.ring;
  if (ring.length < 2) return;
  const step = c.per / subdiv;
  const dur = clamp(step * 0.85, 0.08, 0.3);
  let pos = 0;
  for (const b of beats) {
    for (let k = 0; k < subdiv; k++) {
      const t = b.time + k * step;
      const ch = ring[reverse ? (ring.length - (pos % ring.length)) % ring.length : pos % ring.length];
      c.fb.flash(ch, t, dur);
      pos++;
    }
  }
}

/** Both turn signals + rear alternation lights flash together on beats. */
function layerTurnPulse(c: Ctx, beats: Beat[], which: number[] = [0, 2]) {
  const dur = c.beatFlash(0.35);
  for (const b of beats) {
    if (!which.includes(b.beatInBar)) continue;
    c.fb.flash([...G.frontTurn, ...c.r.rearAlt], b.time, dur);
  }
}

/** Brake (+ rear fog) on kick onsets; fall back to beats 1 & 3 without drums. */
function layerKick(c: Ctx, s: Section, beats: Beat[], fallback: boolean) {
  const hits = onsetsIn(c.a.onsets.low, s.startTime, s.endTime, c.p.thrLow).filter((o) => c.audible(o.time));
  const bars = Math.max(1, s.endBar - s.startBar);
  const flashHits = () => {
    const minGap = Math.max(0.12, c.per * 0.45);
    let last = -Infinity;
    for (const o of hits) {
      if (o.time - last < minGap) continue;
      c.fb.flash(G.brake, o.time, 0.1);
      last = o.time;
    }
  };
  if (hits.length >= bars * 1.5) flashHits();
  else if (fallback) {
    for (const b of beats) if (b.beatInBar === 0 || b.beatInBar === 2) c.fb.flash(G.brake, b.time, 0.12);
  } else flashHits();
}

/** Snare / clap onsets on the snare role lights. */
function layerSnare(c: Ctx, s: Section, alternate: boolean) {
  const low = onsetsIn(c.a.onsets.low, s.startTime, s.endTime, 0);
  const hits = withoutKicks(onsetsIn(c.a.onsets.mid, s.startTime, s.endTime, c.p.thrMid), low).filter((o) => c.audible(o.time));
  let side = 0;
  const [l, r] = c.r.snare;
  const ramping = c.r.snare[0] === CH.innerMainBeamL;
  for (const o of hits) {
    const chans = alternate ? (side === 0 ? l : r) : c.r.snare;
    if (ramping) c.fb.pulse(chans, o.time, 0.06, LIGHT.offRamp500);
    else c.fb.flash(chans, o.time, 0.1);
    side ^= 1;
  }
}

/** Hi-hat onsets on the hats role lights, alternating sides. */
function layerHats(c: Ctx, s: Section, chans: readonly [number, number]) {
  if (!c.p.hats) return;
  const hits = onsetsIn(c.a.onsets.high, s.startTime, s.endTime, c.p.thrHigh).filter((o) => c.audible(o.time));
  let side = 0;
  let last = -Infinity;
  for (const o of hits) {
    if (o.time - last < 0.1) continue;
    c.fb.flash(chans[side], o.time, 0.06);
    side ^= 1;
    last = o.time;
  }
}

/** Bar accents on chosen beats. */
function layerDownbeat(c: Ctx, beats: Beat[], chans: readonly number[], dur: number, which: number[] = [0]) {
  if (!chans.length) return;
  for (const b of beats) if (which.includes(b.beatInBar)) c.fb.flash(chans, b.time, dur);
}

/** Aux park + side markers on the off-beat 8ths of beats 2 and 4. */
function layerOffbeat(c: Ctx, beats: Beat[], every = false) {
  if (!c.r.park.length) return;
  for (const b of beats) {
    if (!every && b.beatInBar !== 1 && b.beatInBar !== 3) continue;
    c.fb.flash(c.r.park, b.time + c.per / 2, clamp(c.per * 0.25, 0.08, 0.16));
  }
}

/** Ambient channels 4-6: slow breathing with 2 s ramps, bar by bar. */
function layerAmbientBreathe(c: Ctx, s: Section, counterPhase: boolean) {
  const barLen = c.per * 4;
  const onCode = barLen >= 1.6 ? LIGHT.onRamp2000 : LIGHT.onRamp1000;
  const offCode = barLen >= 1.6 ? LIGHT.offRamp2000 : LIGHT.offRamp1000;
  const bars = c.a.bars.filter((t) => t >= s.startTime && t < s.endTime);
  bars.forEach((t, i) => {
    if (!c.audible(t)) return;
    const end = Math.min(s.endTime, t + barLen);
    const phaseOn = i % 2 === 0;
    c.fb.set(G.ambientL, t, end, phaseOn ? onCode : offCode);
    c.fb.set(G.ambientR, t, end, (counterPhase ? !phaseOn : phaseOn) ? onCode : offCode);
  });
  c.fb.set(G.ambient, s.endTime - 0.02, s.endTime, LIGHT.off);
}

/** Ambient channels 4-6: decaying glow on beats (instant on, 500 ms fade). */
function layerAmbientPulse(c: Ctx, beats: Beat[], alternate: boolean, which?: number[]) {
  for (const b of beats) {
    if (which && !which.includes(b.beatInBar)) continue;
    const chans = alternate ? (b.index % 2 === 0 ? G.ambientL : G.ambientR) : G.ambient;
    c.fb.pulse(chans, b.time, 0.06, LIGHT.offRamp500);
  }
}

/** Inner main beams: soft pulse on chosen beats. */
function layerInnerPulse(c: Ctx, beats: Beat[], which: number[], offCode: number, alternate = false) {
  for (const b of beats) {
    if (!which.includes(b.beatInBar)) continue;
    const chans = alternate ? (b.bar % 2 === 0 ? G.innerL : G.innerR) : G.inner;
    c.fb.pulse(chans, b.time, 0.08, offCode);
  }
}

/** Tail lights: steady, half-note alternation or 8th-note chase. */
function layerTails(c: Ctx, s: Section, beats: Beat[], mode: 'steady' | 'alternate' | 'eighths') {
  if (mode === 'steady') {
    let on = false;
    let t0 = s.startTime;
    const step = 0.1;
    for (let t = s.startTime; t < s.endTime; t += step) {
      const a = c.audible(t);
      if (a && !on) {
        t0 = t;
        on = true;
      } else if (!a && on) {
        c.fb.set(G.tail, t0, t, LIGHT.on);
        on = false;
      }
    }
    if (on) c.fb.set(G.tail, t0, s.endTime, LIGHT.on);
    return;
  }
  if (c.r.tailsCombined) {
    // One shared output: flash both together with clear gaps instead of alternating.
    const dur = c.beatFlash(0.4);
    for (const b of beats) if (b.beatInBar % 2 === 0) c.fb.flash(G.tail, b.time, dur);
    return;
  }
  if (mode === 'alternate') {
    const dur = c.beatFlash(0.5);
    for (const b of beats) c.fb.flash(b.beatInBar % 2 === 0 ? G.tailL : G.tailR, b.time, dur);
    return;
  }
  const step = c.per / 2;
  const dur = clamp(step * 0.6, 0.08, 0.2);
  for (const b of beats) {
    c.fb.flash(G.tailL, b.time, dur);
    c.fb.flash(G.tailR, b.time + step, dur);
  }
}

/** Outer main beams alternate L/R on half notes, both on the downbeat. */
function layerHeadlights(c: Ctx, beats: Beat[]) {
  const dur = c.beatFlash(0.4);
  for (const b of beats) {
    if (b.beatInBar === 0) c.fb.flash(G.outer, b.time, dur);
    else if (b.beatInBar === 2) c.fb.flash(b.bar % 2 === 0 ? G.outerL : G.outerR, b.time, dur);
  }
}

/** 16th-note strobe on the last beat of every 4th bar. */
function layerStrobeFills(c: Ctx, beats: Beat[], chans: readonly number[]) {
  if (!c.p.strobeFills) return;
  for (const b of beats) {
    if (b.beatInBar !== 3 || b.bar % 4 !== 3) continue;
    const n = 4;
    const step = c.per / n;
    for (let k = 0; k < n; k++) c.fb.flash(chans, b.time + k * step, Math.max(0.04, step * 0.45));
  }
}

// ---- programs --------------------------------------------------------------

function programLow(c: Ctx, s: Section, variant: number) {
  const beats = c.beatsIn(s);
  layerAmbientBreathe(c, s, variant % 2 === 1);
  layerInnerPulse(c, beats, [0], LIGHT.offRamp1000, variant === 2);
  layerTails(c, s, beats, 'steady');
  layerKick(c, s, beats, false);
  layerSnare(c, s, false);
  if (c.p.hats && variant === 1) layerHats(c, s, [G.repL, G.repR]);
}

function programMid(c: Ctx, s: Section, variant: number) {
  const beats = c.beatsIn(s);
  if (variant === 1) layerRingChase(c, beats, 1, false);
  else layerTurnAlternate(c, beats, variant === 2, true);
  layerTails(c, s, beats, variant === 1 ? 'steady' : 'alternate');
  layerKick(c, s, beats, true);
  layerSnare(c, s, variant === 2);
  layerHats(c, s, c.r.hats);
  layerInnerPulse(c, beats, [0], LIGHT.offRamp500);
  layerAmbientPulse(c, beats, variant !== 0, [0, 2]);
  layerDownbeat(c, beats, c.r.accent, 0.12);
  layerOffbeat(c, beats);
}

function programHigh(c: Ctx, s: Section, variant: number) {
  const beats = c.beatsIn(s);
  if (variant === 1) layerRingChase(c, beats, 2, s.index % 2 === 1);
  else if (variant === 2) {
    layerTurnPulse(c, beats, [0, 1, 2, 3]);
    layerRingChase(c, beats, 1, false);
  } else layerTurnAlternate(c, beats, true, true);
  layerTails(c, s, beats, variant === 2 ? 'alternate' : 'eighths');
  layerKick(c, s, beats, true);
  layerSnare(c, s, variant === 1);
  layerHats(c, s, c.r.hats);
  layerInnerPulse(c, beats, [0, 2], LIGHT.offRamp500);
  layerAmbientPulse(c, beats, true);
  layerDownbeat(c, beats, c.r.accent, 0.12, [0, 2]);
  layerOffbeat(c, beats, variant === 2);
  if (c.p.headlightsAlternate) layerHeadlights(c, beats);
  else layerDownbeat(c, beats, G.outer, 0.15);
  layerStrobeFills(c, beats, c.p.hats ? c.r.snare : c.r.hats);
}

// ---- transitions -----------------------------------------------------------

function applyBuild(c: Ctx, s: Section, events: ShowEvent[]) {
  if (!c.p.buildStrobes) return;
  const barLen = c.per * 4;
  const buildStart = Math.max(s.startTime, s.endTime - 4 * barLen);
  const beats = c.a.beats.filter((b) => b.time >= buildStart && b.time < s.endTime);
  if (beats.length < 4) return;
  events.push({ time: buildStart, kind: 'build', label: 'Build' });
  const total = s.endTime - buildStart;
  for (const b of beats) {
    const progress = (b.time - buildStart) / total;
    const subdiv = progress < 0.5 ? 2 : progress < 0.85 ? 4 : 8;
    const step = c.per / subdiv;
    for (let k = 0; k < subdiv; k++) {
      const t = b.time + k * step;
      if (t >= s.endTime - c.per * 0.5) break;
      c.fb.flash(c.r.hats, t, Math.max(0.03, step * 0.45));
    }
  }
  c.fb.set(G.ambient, buildStart, s.endTime - c.per * 0.5, LIGHT.onRamp2000);
}

function applyDrop(c: Ctx, s: Section, events: ShowEvent[]) {
  if (!c.p.dropHits) return;
  const t = s.startTime;
  c.fb.clear(LIGHT_CHANNELS, t - c.per * 0.5, t);
  c.fb.flash(LIGHT_CHANNELS, t, clamp(c.per * 0.4, 0.15, 0.25));
  events.push({ time: t, kind: 'drop', label: 'Drop' });
}

function applyEnding(c: Ctx, events: ShowEvent[]) {
  const a = c.a;
  const end = a.lastSound;
  const tracked = a.beats.filter((b) => !b.inferred && b.time <= end);
  let hit = end - 0.3;
  if (tracked.length) {
    const lastBeat = tracked[tracked.length - 1];
    if (end - lastBeat.time < 1.5) hit = lastBeat.time;
  }
  hit = Math.max(0, hit);
  c.fb.clear(LIGHT_CHANNELS, hit, c.fb.frameCount * c.fb.stepS);
  c.fb.flash(LIGHT_CHANNELS, hit, 0.3);
  const rampers = [...G.inner, ...G.outer, ...G.sig, ...G.ambient, ...G.frontTurn];
  c.fb.set(rampers, hit + 0.3, hit + 0.3 + 2.1, LIGHT.offRamp2000);
  events.push({ time: hit, kind: 'ending', label: 'Finale' });
}

// ---- entry point -----------------------------------------------------------

export function generateShow(a: AnalysisResult, options: Partial<ShowOptions> = {}): GeneratedShow {
  const opts: ShowOptions = {
    ...DEFAULT_SHOW_OPTIONS,
    ...options,
    vehicle: { ...DEFAULT_SHOW_OPTIONS.vehicle, ...(options.vehicle ?? {}) },
    closures: { ...DEFAULT_SHOW_OPTIONS.closures, ...(options.closures ?? {}) },
  };
  const profile = vehicleProfile(opts.vehicle);
  const roles = rolesFor(profile);
  const frameCount = Math.max(1, Math.ceil(a.duration * a.fps));
  const fb = new FrameBuffer(frameCount);
  const p = styleParams(opts.style, opts.intensity);
  const c = new Ctx(fb, a, p, roles);
  const events: ShowEvent[] = [];
  const warnings: string[] = [...roles.notes];

  const sections = a.sections.length
    ? a.sections
    : [{ index: 0, startTime: 0, endTime: a.duration, startBar: 0, endBar: 0, tier: 'mid' as const, energy: 0.5, build: false }];

  sections.forEach((s, i) => {
    const variant = i % 3;
    if (s.tier === 'low') programLow(c, s, variant);
    else if (s.tier === 'mid') programMid(c, s, variant);
    else programHigh(c, s, variant);
  });

  sections.forEach((s, i) => {
    const next = sections[i + 1];
    if (s.build && next) applyBuild(c, s, events);
    if (next && next.tier === 'high' && s.tier !== 'high') applyDrop(c, next, events);
    else if (next && s.build && next.energy > s.energy + 0.15) applyDrop(c, next, events);
  });

  applyEnding(c, events);

  if (a.firstSound > 0.1) fb.clear(LIGHT_CHANNELS, 0, a.firstSound - 0.02);

  const closureResult = applyClosures(fb, a, profile, opts.closures, events);
  warnings.push(...closureResult.warnings);

  // Lights this vehicle does not have stay dark.
  if (profile.absentChannels.size) fb.clearFrames([...profile.absentChannels], 0, frameCount);

  fb.data.fill(0, (frameCount - 1) * 48);

  events.sort((x, y) => x.time - y.time);
  return { frames: fb.data, frameCount, stepMs: 20, channelCount: 48, events, warnings };
}
