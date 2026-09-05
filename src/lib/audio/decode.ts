/**
 * Browser-only helpers: decode any audio the browser understands into a
 * 44.1 kHz AudioBuffer (Tesla's required rate) and mix to mono for analysis.
 */
export const TARGET_RATE = 44100;
export const MAX_DURATION_S = 20 * 60;

export async function decodeToBuffer(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser does not support the Web Audio API.');
  // decodeAudioData resamples to the context rate, so we always end up at 44.1 kHz.
  const ctx = new Offline(2, TARGET_RATE, TARGET_RATE);
  const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
    // Use the callback form for the widest browser support.
    const p = ctx.decodeAudioData(bytes.slice(0), resolve, (err) => reject(err ?? new Error('decode failed')));
    if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
  });
  if (buffer.duration > MAX_DURATION_S) {
    throw new Error(`That file is ${Math.round(buffer.duration / 60)} minutes long. Please use a track under 20 minutes.`);
  }
  if (buffer.duration < 2) throw new Error('That file is too short to make a show from.');
  return buffer;
}

export function toMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  const chans = buffer.numberOfChannels;
  for (let c = 0; c < chans; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  if (chans > 1) for (let i = 0; i < n; i++) out[i] /= chans;
  return out;
}

/** Stereo (or mono) Float32 channels for WAV export. */
export function toExportChannels(buffer: AudioBuffer): Float32Array[] {
  if (buffer.numberOfChannels === 1) return [buffer.getChannelData(0)];
  return [buffer.getChannelData(0), buffer.getChannelData(1)];
}
