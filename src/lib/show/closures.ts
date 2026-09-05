/**
 * Closure choreography (charge port, mirrors, windows, liftgate, door
 * handles). Conservative by design: it respects the per-show command limits
 * from the README, the "must be open before it can dance" rule, the ~30 s
 * dance thermal guideline and closure travel times.
 */
import { CH, CLOSURE, CLOSURE_LIMITS } from '../tesla/channels';
import type { AnalysisResult } from '../audio/analyze';
import type { Section } from '../audio/sections';
import type { FrameBuffer } from './frameBuffer';
import type { ClosureOptions, ShowEvent } from './types';

const HOLD = 0.5; // seconds to hold a one-shot command value

function highSections(a: AnalysisResult): Section[] {
  const highs = a.sections.filter((s) => s.tier === 'high' && s.endTime - s.startTime >= 5);
  if (highs.length) return highs;
  // Flat songs: use the most energetic section.
  const best = [...a.sections].sort((x, y) => y.energy - x.energy)[0];
  return best ? [best] : [];
}

export function applyClosures(fb: FrameBuffer, a: AnalysisResult, opts: ClosureOptions, events: ShowEvent[]): void {
  const start = Math.max(0.5, a.firstSound);
  const end = a.lastSound;
  const highs = highSections(a);

  if (opts.chargePort && end - start >= 8) {
    // Open (1), Dance (2), Close (3) = exactly the 3-command limit.
    const tOpen = start + 0.5;
    const tDance = tOpen + 3; // door takes ~2 s to open; dance only honoured once open
    const tClose = Math.min(end - 1.5, tDance + 110); // door auto-closes after 2 min anyway
    fb.set(CH.chargePort, tOpen, tOpen + HOLD, CLOSURE.open);
    if (tClose > tDance + 1) {
      fb.set(CH.chargePort, tDance, tClose, CLOSURE.dance);
      fb.set(CH.chargePort, tClose, tClose + HOLD, CLOSURE.close);
    } else {
      fb.set(CH.chargePort, Math.max(tOpen + HOLD, end - 1.5), Math.max(tOpen + HOLD, end - 1.5) + HOLD, CLOSURE.close);
    }
    events.push({ time: tOpen, kind: 'closure', label: 'Charge port opens' });
  }

  if (opts.mirrors) {
    // Fold on each drop, unfold ~4 s later. Max 20 commands per mirror.
    const maxPairs = Math.floor(CLOSURE_LIMITS.mirrors / 2);
    let pairs = 0;
    let lastT = -Infinity;
    for (const s of highs) {
      if (pairs >= maxPairs) break;
      const tFold = s.startTime;
      const tUnfold = Math.min(tFold + 4, s.endTime - 0.5);
      if (tFold - lastT < 8 || tUnfold - tFold < 3 || tUnfold + 3 > end) continue;
      fb.set([CH.mirrorL, CH.mirrorR], tFold, tFold + HOLD, CLOSURE.close);
      fb.set([CH.mirrorL, CH.mirrorR], tUnfold, tUnfold + HOLD, CLOSURE.open);
      events.push({ time: tFold, kind: 'closure', label: 'Mirrors fold' });
      lastT = tFold;
      pairs++;
    }
  }

  if (opts.windows && highs.length) {
    // One dance episode on the longest high section, staggered per window, then close.
    const best = [...highs].sort((x, y) => y.endTime - y.startTime - (x.endTime - x.startTime))[0];
    const tStart = best.startTime + 0.2;
    const tStop = Math.min(best.endTime, tStart + 20, end - 6);
    if (tStop - tStart >= 4) {
      const windows = [CH.windowFrontL, CH.windowFrontR, CH.windowRearL, CH.windowRearR];
      windows.forEach((w, i) => {
        const t0 = tStart + i * 0.3;
        fb.set(w, t0, tStop, CLOSURE.dance);
        fb.set(w, tStop, tStop + HOLD, CLOSURE.close); // ~4 s to close
      });
      events.push({ time: tStart, kind: 'closure', label: 'Windows dance' });
    }
  }

  if (opts.liftgate && end - start >= 30) {
    // Open at the start (~14 s travel), dance on the first big section once
    // fully open (<= 20 s), close near the end (~4 s travel). 3 commands.
    const tOpen = start + 0.5;
    const openBy = tOpen + 15;
    const tClose = end - 6;
    if (tClose > openBy + 1) {
      fb.set(CH.liftgate, tOpen, tOpen + HOLD, CLOSURE.open);
      const candidate = highs.find((s) => s.endTime > openBy + 2 && s.startTime < tClose - 2);
      if (candidate) {
        const d0 = Math.max(openBy, candidate.startTime);
        const d1 = Math.min(candidate.endTime, d0 + 20, tClose - 1);
        if (d1 - d0 >= 3) {
          fb.set(CH.liftgate, d0, d1, CLOSURE.dance);
          events.push({ time: d0, kind: 'closure', label: 'Liftgate dances' });
        }
      }
      fb.set(CH.liftgate, tClose, tClose + HOLD, CLOSURE.close);
      events.push({ time: tOpen, kind: 'closure', label: 'Liftgate opens' });
    }
  }

  if (opts.doorHandles) {
    // Present on drops, retract at the end of the section. Max 20 commands each.
    const handles = [CH.doorHandleFrontL, CH.doorHandleRearL, CH.doorHandleFrontR, CH.doorHandleRearR];
    const maxPairs = Math.floor(CLOSURE_LIMITS.doorHandles / 2);
    let pairs = 0;
    for (const s of highs) {
      if (pairs >= maxPairs) break;
      const t0 = s.startTime;
      const t1 = Math.min(s.endTime - 0.2, end - 3);
      if (t1 - t0 < 4) continue;
      fb.set(handles, t0, t0 + HOLD, CLOSURE.open);
      fb.set(handles, t1, t1 + HOLD, CLOSURE.close);
      events.push({ time: t0, kind: 'closure', label: 'Door handles present' });
      pairs++;
    }
  }
}
