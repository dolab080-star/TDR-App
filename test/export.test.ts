import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/lib/export/wav';
import { canPassThrough, sniffAudio } from '../src/lib/export/audioInfo';
import { sanitizeBaseName } from '../src/lib/export/zip';
import { simulateBrightness } from '../src/lib/show/simulate';
import { CH, LIGHT } from '../src/lib/tesla/channels';

/** Build one MPEG1 Layer III frame header + zero payload. */
function mp3Frame(sampleRateBits: number, sampleRate: number): number[] {
  const frameLen = Math.floor((144 * 128000) / sampleRate);
  const frame = new Array(frameLen).fill(0);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG1, Layer III, no CRC
  frame[2] = 0x90 | (sampleRateBits << 2); // 128 kbps, no padding
  frame[3] = 0x00; // stereo
  return frame;
}

describe('wav + sniffing', () => {
  it('encodes a 16-bit stereo WAV that sniffs as pass-through capable', () => {
    const l = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const r = new Float32Array([0, -0.5, 0.5, -1, 1]);
    const wav = encodeWav([l, r], 44100);
    expect(wav.length).toBe(44 + 5 * 4);
    const info = sniffAudio(wav);
    expect(info).toEqual({ container: 'wav', sampleRate: 44100, channels: 2, bitsPerSample: 16, pcm: true });
    expect(canPassThrough(info)).toBe(true);
    expect(canPassThrough(sniffAudio(encodeWav([l], 48000)))).toBe(false);
    const dv = new DataView(wav.buffer);
    // interleaved: frame 3 left = +1.0, frame 4 left = -1.0
    expect(dv.getInt16(44 + 3 * 4, true)).toBe(32767);
    expect(dv.getInt16(44 + 4 * 4, true)).toBe(-32768);
    expect(dv.getInt16(44 + 1 * 4 + 2, true)).toBe(-16384); // frame 1 right = -0.5
  });

  it('detects MP3 frame headers behind an ID3v2 tag', () => {
    const id3 = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0)];
    const f44 = mp3Frame(0, 44100);
    const info = sniffAudio(new Uint8Array([...id3, ...f44, ...f44]));
    expect(info.container).toBe('mp3');
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(canPassThrough(info)).toBe(true);

    const f48 = mp3Frame(1, 48000);
    const info48 = sniffAudio(new Uint8Array([...f48, ...f48]));
    expect(info48.sampleRate).toBe(48000);
    expect(canPassThrough(info48)).toBe(false);

    expect(sniffAudio(new Uint8Array(100)).container).toBe('unknown');
    // a lone sync word without a consistent following frame is not an mp3
    expect(sniffAudio(new Uint8Array([...f44, ...new Array(500).fill(0)])).container).toBe('unknown');
  });

  it('sanitises file names', () => {
    expect(sanitizeBaseName('My Song (Remix).mp3')).toBe('My_Song_Remix');
    expect(sanitizeBaseName('???.wav')).toBe('lightshow');
  });

  it('does not truncate video titles that happen to contain a dot', () => {
    expect(sanitizeBaseName('Mr. Brightside (Official Video)')).toBe('Mr_Brightside_Official_Video');
    expect(sanitizeBaseName('Symphony No. 5')).toBe('Symphony_No_5');
    expect(sanitizeBaseName('Daft Punk - Harder, Better')).toBe('Daft_Punk_-_Harder_Better');
  });
});

describe('simulateBrightness', () => {
  it('ramps ramping channels and snaps boolean ones', () => {
    const frameCount = 60;
    const frames = new Uint8Array(48 * frameCount);
    for (let f = 0; f < frameCount; f++) {
      frames[f * 48 + CH.innerMainBeamL - 1] = f < 5 ? LIGHT.on : LIGHT.offRamp500;
      frames[f * 48 + CH.brakeLights - 1] = f < 5 ? LIGHT.on : LIGHT.offRamp500;
    }
    const b = simulateBrightness(frames, frameCount);
    const inner = (f: number) => b[f * 48 + CH.innerMainBeamL - 1];
    const brake = (f: number) => b[f * 48 + CH.brakeLights - 1];
    expect(inner(4)).toBe(1);
    expect(inner(5)).toBeCloseTo(1 - 0.04, 5);
    expect(inner(17)).toBeCloseTo(1 - 13 * 0.04, 4);
    expect(inner(40)).toBe(0);
    expect(brake(4)).toBe(1);
    expect(brake(5)).toBe(0);
  });
});
