/**
 * Sniff container-level facts about an uploaded audio file so we can decide
 * whether it can be copied to the USB stick as-is (Tesla wants 44.1 kHz
 * .wav or .mp3) or must be re-encoded to WAV.
 */
export interface AudioInfo {
  container: 'mp3' | 'wav' | 'unknown';
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  /** WAV only: true for integer PCM (format 1). */
  pcm?: boolean;
}

const MPEG_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

interface Mp3Header {
  version: number;
  layer: number;
  sampleRate: number;
  channels: number;
  frameLength: number;
}

function parseMp3Header(b: Uint8Array, i: number): Mp3Header | null {
  if (i + 4 > b.length) return null;
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[i + 1] >> 3) & 3;
  if (version === 1) return null;
  const layerBits = (b[i + 1] >> 1) & 3;
  if (layerBits === 0) return null;
  const layer = 4 - layerBits; // 1..3
  const bitrateIdx = (b[i + 2] >> 4) & 0xf;
  if (bitrateIdx === 0 || bitrateIdx === 15) return null;
  const rateIdx = (b[i + 2] >> 2) & 3;
  if (rateIdx === 3) return null;
  const sampleRate = MPEG_RATES[version][rateIdx];
  const padding = (b[i + 2] >> 1) & 1;
  const channelMode = (b[i + 3] >> 6) & 3;
  const channels = channelMode === 3 ? 1 : 2;
  let frameLength = 0;
  if (layer === 3) {
    const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx];
    const coef = version === 3 ? 144 : 72;
    frameLength = Math.floor((coef * kbps * 1000) / sampleRate) + padding;
  }
  return { version, layer, sampleRate, channels, frameLength };
}

export function sniffAudio(bytes: Uint8Array): AudioInfo {
  const b = bytes;
  const ascii = (off: number, len: number) => String.fromCharCode(...b.subarray(off, off + len));

  // WAV
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let pos = 12;
    while (pos + 8 <= b.length) {
      const id = ascii(pos, 4);
      const size = dv.getUint32(pos + 4, true);
      if (id === 'fmt ' && pos + 8 + 16 <= b.length) {
        let format = dv.getUint16(pos + 8, true);
        const channels = dv.getUint16(pos + 10, true);
        const sampleRate = dv.getUint32(pos + 12, true);
        const bitsPerSample = dv.getUint16(pos + 22, true);
        if (format === 0xfffe && size >= 40 && pos + 8 + 26 <= b.length) {
          // WAVE_FORMAT_EXTENSIBLE: sub-format GUID's first two bytes hold the real format.
          format = dv.getUint16(pos + 8 + 24, true);
        }
        return { container: 'wav', sampleRate, channels, bitsPerSample, pcm: format === 1 };
      }
      pos += 8 + size + (size & 1);
    }
    return { container: 'wav' };
  }

  // MP3: skip ID3v2, then look for two consecutive consistent frame headers.
  let start = 0;
  if (b.length >= 10 && ascii(0, 3) === 'ID3') {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    start = 10 + size + (b[5] & 0x10 ? 10 : 0);
  }
  const limit = Math.min(b.length - 4, start + 256 * 1024);
  for (let i = start; i < limit; i++) {
    const h = parseMp3Header(b, i);
    if (!h) continue;
    if (h.layer === 3 && h.frameLength > 0) {
      const next = parseMp3Header(b, i + h.frameLength);
      if (!next || next.sampleRate !== h.sampleRate || next.version !== h.version) continue;
    }
    return { container: 'mp3', sampleRate: h.sampleRate, channels: h.channels };
  }
  return { container: 'unknown' };
}

/** Can this file go on the USB stick untouched? */
export function canPassThrough(info: AudioInfo): boolean {
  if (info.sampleRate !== 44100) return false;
  if (info.container === 'mp3') return true;
  if (info.container === 'wav') return info.pcm === true && info.bitsPerSample === 16;
  return false;
}
