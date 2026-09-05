/**
 * 16-bit PCM WAV encoder. Tesla recommends .wav at 44.1 kHz.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channels.length;
  if (numChannels === 0) throw new Error('need at least one channel');
  const frames = channels[0].length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new Uint8Array(44 + dataSize);
  const dv = new DataView(out.buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, dataSize, true);
  let pos = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let v = channels[c][i];
      if (v > 1) v = 1;
      else if (v < -1) v = -1;
      dv.setInt16(pos, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
      pos += 2;
    }
  }
  return out;
}
