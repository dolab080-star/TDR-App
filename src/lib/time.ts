/** mm:ss(.s) <-> seconds helpers for cue inputs. */

export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = parseFloat(m[2]);
  if (!Number.isFinite(seconds) || (m[1] && seconds >= 60)) return null;
  return minutes * 60 + seconds;
}

/** "0:05, 1:23.5 90" -> [5, 83.5, 90]; invalid entries are dropped. */
export function parseTimeList(text: string): number[] {
  return text
    .split(/[,\s;]+/)
    .map(parseTime)
    .filter((v): v is number => v != null && v >= 0)
    .sort((a, b) => a - b);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const whole = Math.abs(rem - Math.round(rem)) < 0.05;
  const secText = whole ? String(Math.round(rem)).padStart(2, '0') : rem.toFixed(1).padStart(4, '0');
  return `${m}:${secText}`;
}

export function formatTimeList(times: number[]): string {
  return times.map(formatTime).join(', ');
}
