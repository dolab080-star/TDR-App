/**
 * Closure choreography (charge port, mirrors, windows, liftgate/frunk, door
 * handles, Model X doors) driven by per-closure options.
 *
 * Every cue goes through a ClosureTrack that enforces Tesla's rules from the
 * README: per-show command limits (Open/Close/Dance each count), "must be
 * open before it can dance" (windows excepted), travel times between moves,
 * and a dance-length ceiling for thermal protection. Anything that has to be
 * dropped or clamped is reported as a warning instead of silently vanishing.
 */
import { CH, CLOSURE, CLOSURE_LIMITS } from '../tesla/channels';
import type { VehicleProfile } from '../tesla/vehicles';
import type { AnalysisResult } from '../audio/analyze';
import type { Section } from '../audio/sections';
import type { FrameBuffer } from './frameBuffer';
import type { ClosureOptions, MoveTrigger, OpenDanceCloseOptions, ShowEvent } from './types';

const HOLD = 0.5; // seconds a one-shot command value is held
const MAX_DANCE_S = 30; // thermal guidance from the README
export const TRAVEL = {
  liftgateOpen: 14,
  liftgateClose: 4,
  frontDoorOpen: 22,
  frontDoorClose: 3,
  falconOpen: 20,
  falconClose: 8,
  windows: 4,
  small: 2, // mirrors, door handles, charge port
} as const;

interface Cue {
  t: number;
  end: number;
  value: number;
}

class ClosureTrack {
  readonly cues: Cue[] = [];
  private commands = 0;
  private dropped = 0;

  constructor(
    readonly label: string,
    readonly channels: readonly number[],
    readonly limit: number,
    private readonly warnings: string[],
    private readonly songEnd: number,
  ) {}

  private lastEnd(): number {
    return this.cues.length ? this.cues[this.cues.length - 1].end : -Infinity;
  }

  /** Add a cue; returns false (and remembers a warning) when it cannot fit. */
  add(t: number, value: number, hold: number, minGapBefore = 0): boolean {
    if (!Number.isFinite(t) || t < 0 || t >= this.songEnd) {
      this.dropped++;
      return false;
    }
    if (t < this.lastEnd() + minGapBefore) {
      this.dropped++;
      return false;
    }
    const counts = value === CLOSURE.open || value === CLOSURE.close || value === CLOSURE.dance;
    if (counts && this.commands >= this.limit) {
      this.dropped++;
      return false;
    }
    if (counts) this.commands++;
    this.cues.push({ t, end: Math.min(this.songEnd, t + Math.max(HOLD, hold)), value });
    return true;
  }

  finish(fb: FrameBuffer): void {
    for (const c of this.cues) fb.set(this.channels, c.t, c.end, c.value);
    if (this.dropped > 0) {
      this.warnings.push(
        `${this.label}: ${this.dropped} requested move${this.dropped > 1 ? 's' : ''} skipped (command limit of ${this.limit}, travel time, or outside the song).`,
      );
    }
  }
}

interface Ctx {
  a: AnalysisResult;
  profile: VehicleProfile;
  start: number;
  end: number;
  highs: Section[];
  loudest: Section | null;
  warnings: string[];
  events: ShowEvent[];
}

function highSections(a: AnalysisResult): Section[] {
  const highs = a.sections.filter((s) => s.tier === 'high' && s.endTime - s.startTime >= 5);
  if (highs.length) return highs;
  const best = [...a.sections].sort((x, y) => y.energy - x.energy)[0];
  return best ? [best] : [];
}

function clampTime(c: Ctx, t: number): number {
  return Math.min(Math.max(0, t), Math.max(0, c.end - 0.1));
}

function openTime(c: Ctx, at: 'start' | 'firstDrop' | 'custom', custom: number): number {
  if (at === 'custom') return clampTime(c, custom);
  if (at === 'firstDrop') return c.highs[0]?.startTime ?? c.start + 0.5;
  return c.start + 0.5;
}

function triggerTimes(c: Ctx, trigger: MoveTrigger, custom: number[]): number[] {
  switch (trigger) {
    case 'drops':
      return c.highs.map((s) => s.startTime);
    case 'firstDrop':
      return c.highs.length ? [c.highs[0].startTime] : [];
    case 'loudest':
      return c.loudest ? [c.loudest.startTime] : [];
    case 'custom':
      return [...custom].sort((x, y) => x - y).map((t) => clampTime(c, t));
  }
}

function danceEpisodes(c: Ctx, mode: OpenDanceCloseOptions['dance'], seconds: number, custom: number[], notBefore: number, notAfter: number): [number, number][] {
  const len = Math.min(MAX_DANCE_S, Math.max(1, seconds));
  let starts: number[] = [];
  if (mode === 'loudest') starts = c.loudest ? [Math.max(notBefore, c.loudest.startTime)] : [];
  else if (mode === 'everyHigh') starts = c.highs.map((s) => Math.max(notBefore, s.startTime));
  else if (mode === 'custom') starts = custom.map((t) => clampTime(c, t));
  const out: [number, number][] = [];
  for (const s of starts.sort((x, y) => x - y)) {
    const e = Math.min(s + len, notAfter);
    if (s < notBefore || e - s < 1.5) continue;
    if (out.length && s < out[out.length - 1][1] + 2) continue;
    out.push([s, e]);
  }
  return out;
}

/** Open → dance → close for liftgate/frunk and falcon doors. */
function applyOpenDanceClose(
  c: Ctx,
  fb: FrameBuffer,
  label: string,
  channels: readonly number[],
  limit: number,
  o: OpenDanceCloseOptions,
  travelOpen: number,
  travelClose: number,
) {
  const track = new ClosureTrack(label, channels, limit, c.warnings, c.end);
  const tOpen = openTime(c, o.openAt, o.openTime);
  const readyAt = tOpen + travelOpen + 1;
  if (c.end - tOpen < travelOpen + travelClose + 2) {
    c.warnings.push(`${label}: not enough time to open (${travelOpen} s) and close (${travelClose} s) within the song; skipped.`);
    return;
  }
  let tClose = c.end - travelClose - 2;
  const episodes = danceEpisodes(c, o.dance, o.danceSeconds, o.danceTimes, readyAt, tClose - 1);
  const totalDance = episodes.reduce((s, [a, b]) => s + (b - a), 0);
  if (totalDance > MAX_DANCE_S) c.warnings.push(`${label}: dancing for ${Math.round(totalDance)} s total; Tesla recommends about 30 s per show to avoid thermal cut-outs.`);
  if (o.closeAt === 'custom') tClose = clampTime(c, o.closeTime);
  else if (o.closeAt === 'afterDance' && episodes.length) tClose = episodes[episodes.length - 1][1] + 1;
  if (tClose < readyAt) tClose = readyAt;

  if (!track.add(tOpen, CLOSURE.open, HOLD)) return;
  c.events.push({ time: tOpen, kind: 'closure', label: `${label} opens` });
  if (o.dance !== 'none' && episodes.length === 0) {
    c.warnings.push(`${label}: no room for a dance after it finishes opening (${travelOpen} s); the dance was skipped.`);
  }
  for (const [s, e] of episodes) {
    if (e > tClose) break;
    if (track.add(s, CLOSURE.dance, e - s, 0.5)) c.events.push({ time: s, kind: 'closure', label: `${label} dances` });
  }
  if (track.add(tClose, CLOSURE.close, HOLD, 0)) c.events.push({ time: tClose, kind: 'closure', label: `${label} closes` });
  track.finish(fb);
}

export interface ClosureResult {
  warnings: string[];
}

export function applyClosures(fb: FrameBuffer, a: AnalysisResult, profile: VehicleProfile, opts: ClosureOptions, events: ShowEvent[]): ClosureResult {
  const warnings: string[] = [];
  const start = Math.max(0.5, a.firstSound);
  const end = a.lastSound;
  const highs = highSections(a);
  const loudest = highs.length ? [...highs].sort((x, y) => y.endTime - y.startTime - (x.endTime - x.startTime))[0] : null;
  const c: Ctx = { a, profile, start, end, highs, loudest, warnings, events };
  const avail = profile.closures;

  // Charge port: open (1), dance (2), close (3).
  if (opts.chargePort.enabled) {
    if (!avail.chargePort) warnings.push('Charge port: not available on this vehicle; skipped.');
    else {
      const track = new ClosureTrack('Charge port', [CH.chargePort], CLOSURE_LIMITS.chargePort, warnings, end);
      const tOpen = openTime(c, opts.chargePort.openAt, opts.chargePort.openTime);
      const autoClose = tOpen + 115; // door closes itself 2 minutes after opening
      let tClose = opts.chargePort.closeAt === 'custom' ? clampTime(c, opts.chargePort.closeTime) : end - 1.5;
      tClose = Math.min(tClose, autoClose);
      if (tClose > tOpen + 3.5 && track.add(tOpen, CLOSURE.open, HOLD)) {
        events.push({ time: tOpen, kind: 'closure', label: 'Charge port opens' });
        const tDance = tOpen + 3; // ~2 s to open; dance is only honoured once open
        if (opts.chargePort.dance && tClose - tDance > 1) {
          track.add(tDance, CLOSURE.dance, tClose - tDance, 0);
        }
        // The dance runs right up to the close, so no gap is needed here.
        track.add(tClose, CLOSURE.close, HOLD, 0);
      } else if (tClose <= tOpen + 3.5) {
        warnings.push('Charge port: song too short around the chosen times; skipped.');
      }
      track.finish(fb);
    }
  }

  // Mirrors: fold then unfold. 20 commands = 10 pairs.
  if (opts.mirrors.enabled) {
    if (!avail.mirrors) warnings.push('Mirrors: not available on this vehicle; skipped.');
    else {
      const track = new ClosureTrack('Mirrors', [CH.mirrorL, CH.mirrorR], CLOSURE_LIMITS.mirrors, warnings, end);
      const hold = Math.max(TRAVEL.small + 0.5, opts.mirrors.holdSeconds);
      const maxPairs = Math.min(Math.floor(CLOSURE_LIMITS.mirrors / 2), Math.max(1, opts.mirrors.maxMoves));
      let pairs = 0;
      for (const t of triggerTimes(c, opts.mirrors.trigger, opts.mirrors.customTimes)) {
        if (pairs >= maxPairs) {
          warnings.push(`Mirrors: limited to ${maxPairs} fold/unfold moves.`);
          break;
        }
        const tUnfold = t + hold;
        if (tUnfold + TRAVEL.small + 0.5 > end) continue;
        if (!track.add(t, CLOSURE.close, HOLD, TRAVEL.small + 1)) continue;
        track.add(tUnfold, CLOSURE.open, HOLD);
        events.push({ time: t, kind: 'closure', label: 'Mirrors fold' });
        pairs++;
      }
      track.finish(fb);
    }
  }

  // Windows: dance episodes, optionally closing after each one.
  if (opts.windows.enabled) {
    if (!avail.windows) warnings.push('Windows: not available on this vehicle; skipped.');
    else {
      const all = { all: [CH.windowFrontL, CH.windowFrontR, CH.windowRearL, CH.windowRearR], front: [CH.windowFrontL, CH.windowFrontR], rear: [CH.windowRearL, CH.windowRearR] }[opts.windows.which];
      const tracks = all.map((ch, i) => new ClosureTrack(`Window ${i + 1}`, [ch], CLOSURE_LIMITS.windows, warnings, end));
      const len = Math.min(MAX_DANCE_S, Math.max(2, opts.windows.danceSeconds));
      let starts: number[] = [];
      if (opts.windows.trigger === 'loudest') starts = loudest ? [loudest.startTime + 0.2] : [];
      else if (opts.windows.trigger === 'everyHigh') starts = highs.map((s) => s.startTime + 0.2);
      else starts = opts.windows.customTimes.map((t) => clampTime(c, t));
      const perEpisode = opts.windows.closeAfter ? 2 : 1;
      const maxEpisodes = Math.floor(CLOSURE_LIMITS.windows / perEpisode);
      let n = 0;
      let lastEnd = -Infinity;
      let total = 0;
      for (const s of starts.sort((x, y) => x - y)) {
        if (n >= maxEpisodes) {
          warnings.push(`Windows: limited to ${maxEpisodes} dance episodes by the 6-command limit.`);
          break;
        }
        const e = Math.min(s + len, end - (opts.windows.closeAfter ? TRAVEL.windows + 1.5 : 0.5));
        if (e - s < 2 || s < lastEnd + TRAVEL.windows + 1.5) continue;
        tracks.forEach((tr, i) => {
          const t0 = s + (opts.windows.stagger ? i * 0.3 : 0);
          if (tr.add(t0, CLOSURE.dance, e - t0, 0) && opts.windows.closeAfter) tr.add(e, CLOSURE.close, HOLD, 0);
        });
        events.push({ time: s, kind: 'closure', label: 'Windows dance' });
        lastEnd = e + (opts.windows.closeAfter ? TRAVEL.windows : 0);
        total += e - s;
        n++;
      }
      if (total > MAX_DANCE_S) warnings.push(`Windows: dancing for ${Math.round(total)} s total; Tesla recommends about 30 s per show.`);
      if (!opts.windows.closeAfter && n > 0) warnings.push('Windows: left wherever they stop after dancing; enable "close afterwards" to end with them shut.');
      tracks.forEach((tr) => tr.finish(fb));
    }
  }

  // Liftgate / frunk.
  if (opts.liftgate.enabled) {
    if (!avail.liftgate) warnings.push(`${avail.liftgateLabel}: not available on this vehicle configuration; skipped.`);
    else applyOpenDanceClose(c, fb, avail.liftgateLabel, [CH.liftgate], CLOSURE_LIMITS.liftgate, opts.liftgate, TRAVEL.liftgateOpen, TRAVEL.liftgateClose);
  }

  // Door handles (Model S): present then retract.
  if (opts.doorHandles.enabled) {
    if (!avail.doorHandles) warnings.push('Door handles: only Model S has powered handles; skipped.');
    else {
      const handles = [CH.doorHandleFrontL, CH.doorHandleRearL, CH.doorHandleFrontR, CH.doorHandleRearR];
      const track = new ClosureTrack('Door handles', handles, CLOSURE_LIMITS.doorHandles, warnings, end);
      const hold = Math.max(TRAVEL.small + 0.5, opts.doorHandles.holdSeconds);
      for (const t of triggerTimes(c, opts.doorHandles.trigger, opts.doorHandles.customTimes)) {
        const tBack = t + hold;
        if (tBack + TRAVEL.small > end) continue;
        if (!track.add(t, CLOSURE.open, HOLD, TRAVEL.small + 1)) continue;
        track.add(tBack, CLOSURE.close, HOLD);
        events.push({ time: t, kind: 'closure', label: 'Door handles present' });
      }
      track.finish(fb);
    }
  }

  // Model X falcon doors.
  if (opts.falconDoors.enabled) {
    if (!avail.falconDoors) warnings.push('Falcon doors: only Model X has them; skipped.');
    else applyOpenDanceClose(c, fb, 'Falcon doors', [CH.falconDoorL, CH.falconDoorR], CLOSURE_LIMITS.falconDoors, opts.falconDoors, TRAVEL.falconOpen, TRAVEL.falconClose);
  }

  // Model X front doors: open and close only.
  if (opts.frontDoors.enabled) {
    if (!avail.frontDoors) warnings.push('Front doors: only Model X front doors are powered; skipped.');
    else {
      const track = new ClosureTrack('Front doors', [CH.frontDoorL, CH.frontDoorR], CLOSURE_LIMITS.frontDoors, warnings, end);
      const tOpen = openTime(c, opts.frontDoors.openAt, opts.frontDoors.openTime);
      let tClose = opts.frontDoors.closeAt === 'custom' ? clampTime(c, opts.frontDoors.closeTime) : end - TRAVEL.frontDoorClose - 2;
      if (tClose < tOpen + TRAVEL.frontDoorOpen + 1) tClose = tOpen + TRAVEL.frontDoorOpen + 1;
      if (tClose + TRAVEL.frontDoorClose > end) {
        warnings.push('Front doors: not enough time to open (22 s) and close (3 s) within the song; skipped.');
      } else if (track.add(tOpen, CLOSURE.open, HOLD)) {
        events.push({ time: tOpen, kind: 'closure', label: 'Front doors open' });
        if (track.add(tClose, CLOSURE.close, HOLD, 0.5)) events.push({ time: tClose, kind: 'closure', label: 'Front doors close' });
      }
      track.finish(fb);
    }
  }

  return { warnings };
}
