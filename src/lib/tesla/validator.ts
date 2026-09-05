/**
 * Validation of a generated show.
 *
 * The first block mirrors Tesla's official validator.py
 * (https://github.com/teslamotors/light-show/blob/master/validator.py) so a
 * file that passes here passes there. The second block adds checks derived
 * from the README that the official script does not enforce (value codes,
 * closure command limits, step-time range).
 */
import { parseFseqHeader, readFseqFrames } from './fseq';
import {
  CHANNEL_COUNT,
  CLOSURE,
  CLOSURE_CHANNELS,
  CLOSURE_GROUP_CHANNELS,
  CLOSURE_LIMITS,
  CLOSURE_VALUES,
  LIGHT_CHANNELS,
  LIGHT_VALUES,
  UNUSED_CHANNELS,
  CHANNEL_NAMES,
  type ClosureGroup,
} from './channels';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  level: IssueLevel;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  channelCount: number;
  frameCount: number;
  stepTimeMs: number;
  durationS: number;
  /** Number of frames in which any light channel changed value. */
  lightChanges: number;
  /** Number of frames in which any closure channel changed value. */
  closureChanges: number;
  /** Open/Close/Dance commands issued per closure channel (1-based channel -> count). */
  closureCommands: Record<number, number>;
  /** Max commands used per group vs the README limit. */
  closureUsage: { group: ClosureGroup; used: number; limit: number }[];
}

const MAX_DURATION_S = 4 * 60 * 60;

export function validateFseq(bytes: Uint8Array): ValidationReport {
  const issues: ValidationIssue[] = [];
  const fail = (report: Partial<ValidationReport>): ValidationReport => ({
    ok: false,
    issues,
    channelCount: 0,
    frameCount: 0,
    stepTimeMs: 0,
    durationS: 0,
    lightChanges: 0,
    closureChanges: 0,
    closureCommands: {},
    closureUsage: [],
    ...report,
  });

  let header;
  try {
    header = parseFseqHeader(bytes);
  } catch (e) {
    issues.push({ level: 'error', message: `Unknown file format, expected FSEQ v2.0 (${(e as Error).message})` });
    return fail({});
  }

  // --- Tesla validator.py checks -------------------------------------------
  if (header.channelDataOffset < 24 || header.frameCount < 1 || header.stepTimeMs < 15) {
    issues.push({ level: 'error', message: 'Unknown file format, expected FSEQ v2.0' });
  }
  if (header.channelCount !== 48 && header.channelCount !== 200) {
    issues.push({ level: 'error', message: `Expected 48 or 200 channels, got ${header.channelCount}` });
  }
  if (header.compressionType !== 0) {
    issues.push({ level: 'error', message: 'Expected file format to be V2 Uncompressed' });
  }
  const durationS = (header.frameCount * header.stepTimeMs) / 1000;
  if (durationS > MAX_DURATION_S) {
    issues.push({ level: 'error', message: `Expected total duration to be less than 4 hours, got ${formatDuration(durationS)}` });
  }
  if ((header.minorVersion !== 0 && header.minorVersion !== 2) || header.majorVersion !== 2) {
    issues.push({
      level: 'warning',
      message: `FSEQ version is ${header.majorVersion}.${header.minorVersion}. Only 2.0 and 2.2 have been validated by Tesla.`,
    });
  }

  // --- README-derived checks ----------------------------------------------
  if (header.stepTimeMs > 100) {
    issues.push({ level: 'error', message: `Step time ${header.stepTimeMs} ms is above the 100 ms maximum the vehicle supports` });
  } else if (header.stepTimeMs !== 20) {
    issues.push({ level: 'info', message: `Step time is ${header.stepTimeMs} ms; Tesla recommends 20 ms` });
  }

  if (issues.some((i) => i.level === 'error')) {
    return fail({
      channelCount: header.channelCount,
      frameCount: header.frameCount,
      stepTimeMs: header.stepTimeMs,
      durationS,
    });
  }

  let frames: Uint8Array;
  try {
    frames = readFseqFrames(bytes).frames;
  } catch (e) {
    issues.push({ level: 'error', message: (e as Error).message });
    return fail({ channelCount: header.channelCount, frameCount: header.frameCount, stepTimeMs: header.stepTimeMs, durationS });
  }

  const cc = header.channelCount;
  const fc = header.frameCount;
  const closureCommands: Record<number, number> = {};
  let lightChanges = 0;
  let closureChanges = 0;
  const badLightValues = new Set<number>();
  const badClosureValues = new Set<number>();
  const nonZeroUnused = new Set<number>();

  // Only inspect the 48-channel core; a 200-channel file's extra channels are
  // Cybertruck light bars with free brightness values.
  const lightIdx = LIGHT_CHANNELS.map((c) => c - 1);
  const closureIdx = CLOSURE_CHANNELS.map((c) => c - 1);
  const unusedIdx = cc === CHANNEL_COUNT ? UNUSED_CHANNELS.map((c) => c - 1) : [];
  for (const c of CLOSURE_CHANNELS) closureCommands[c] = 0;

  let prev: Uint8Array | null = null;
  for (let f = 0; f < fc; f++) {
    const row = frames.subarray(f * cc, (f + 1) * cc);
    let lightChanged = false;
    let closureChanged = false;
    for (const i of lightIdx) {
      const v = row[i];
      if (!LIGHT_VALUES.has(v)) badLightValues.add(i + 1);
      if (prev && prev[i] !== v) lightChanged = true;
    }
    for (const i of closureIdx) {
      const v = row[i];
      if (!CLOSURE_VALUES.has(v)) badClosureValues.add(i + 1);
      const pv = prev ? prev[i] : CLOSURE.idle;
      if (pv !== v) {
        closureChanged = true;
        if (v === CLOSURE.open || v === CLOSURE.close || v === CLOSURE.dance) closureCommands[i + 1]++;
      }
    }
    for (const i of unusedIdx) if (row[i] !== 0) nonZeroUnused.add(i + 1);
    if (!prev || lightChanged) lightChanges++;
    if (prev && closureChanged) closureChanges++;
    prev = row;
  }

  if (badLightValues.size) {
    issues.push({
      level: 'warning',
      message: `Light channels ${[...badLightValues].join(', ')} contain values that are not xLights on/off/ramp codes`,
    });
  }
  if (badClosureValues.size) {
    issues.push({
      level: 'warning',
      message: `Closure channels ${[...badClosureValues].join(', ')} contain values that are not Idle/Open/Dance/Close/Stop codes`,
    });
  }
  if (nonZeroUnused.size) {
    issues.push({ level: 'warning', message: `Unused channels ${[...nonZeroUnused].join(', ')} are not zero` });
  }

  const closureUsage: ValidationReport['closureUsage'] = [];
  for (const [group, chans] of Object.entries(CLOSURE_GROUP_CHANNELS) as [ClosureGroup, readonly number[]][]) {
    const limit = CLOSURE_LIMITS[group];
    let used = 0;
    for (const c of chans) used = Math.max(used, closureCommands[c] ?? 0);
    closureUsage.push({ group, used, limit });
    if (used > limit) {
      const offenders = chans.filter((c) => (closureCommands[c] ?? 0) > limit).map((c) => CHANNEL_NAMES[c]);
      issues.push({
        level: 'error',
        message: `${offenders.join(', ')}: ${used} Open/Close/Dance commands exceeds the per-show limit of ${limit}`,
      });
    }
  }

  const ok = !issues.some((i) => i.level === 'error');
  return {
    ok,
    issues,
    channelCount: cc,
    frameCount: fc,
    stepTimeMs: header.stepTimeMs,
    durationS,
    lightChanges,
    closureChanges,
    closureCommands,
    closureUsage,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const secStr = sec.toFixed(2).padStart(5, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${secStr}` : `${m}:${secStr}`;
}
