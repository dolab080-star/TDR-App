/**
 * FSEQ v2.0 (uncompressed) writer/reader.
 *
 * Layout (all little-endian):
 *   0   'PSEQ'
 *   4   u16 channel data offset
 *   6   u8  minor version (0)
 *   7   u8  major version (2)
 *   8   u16 header length (32 + 8*compressionBlocks + 6*sparseRanges)
 *   10  u32 channel count per frame
 *   14  u32 frame count
 *   18  u8  step time (ms)
 *   19  u8  flags (0)
 *   20  u8  compression type (0 = none)
 *   21  u8  compression block count (0)
 *   22  u8  sparse range count (0)
 *   23  u8  reserved (0)
 *   24  u64 unique id (we use a microsecond timestamp like xLights)
 *   32  variable headers: u16 length, 2-char code, payload
 *   ... channel data, padded so it starts on a 4-byte boundary
 */

const MAGIC = [0x50, 0x53, 0x45, 0x51]; // 'PSEQ'
const FIXED_HEADER_LEN = 32;

export interface FseqHeader {
  channelDataOffset: number;
  minorVersion: number;
  majorVersion: number;
  headerLength: number;
  channelCount: number;
  frameCount: number;
  stepTimeMs: number;
  flags: number;
  compressionType: number;
  compressionBlockCount: number;
  sparseRangeCount: number;
  uniqueId: bigint;
  variableHeaders: { code: string; data: Uint8Array }[];
}

export interface EncodeFseqOptions {
  channelCount: number;
  stepTimeMs: number;
  /** Media file name to record in the 'mf' variable header (optional). */
  mediaFile?: string;
  /** Producer string for the 'sp' variable header. */
  producer?: string;
  /** Unique id; defaults to now in microseconds. */
  uniqueId?: bigint;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function varHeader(code: string, text: string): Uint8Array {
  const payload = textEncoder.encode(text + '\0');
  const out = new Uint8Array(4 + payload.length);
  const len = out.length;
  out[0] = len & 0xff;
  out[1] = (len >> 8) & 0xff;
  out[2] = code.charCodeAt(0);
  out[3] = code.charCodeAt(1);
  out.set(payload, 4);
  return out;
}

/**
 * Encode frames into an FSEQ v2.0 uncompressed file.
 * `frames` is a flat buffer of frameCount * channelCount bytes.
 */
export function encodeFseq(frames: Uint8Array, opts: EncodeFseqOptions): Uint8Array {
  const { channelCount, stepTimeMs } = opts;
  if (channelCount <= 0) throw new Error('channelCount must be > 0');
  if (stepTimeMs < 1 || stepTimeMs > 255) throw new Error('stepTimeMs must be 1..255');
  if (frames.length % channelCount !== 0) {
    throw new Error(`frame buffer length ${frames.length} is not a multiple of channelCount ${channelCount}`);
  }
  const frameCount = frames.length / channelCount;
  if (frameCount < 1) throw new Error('need at least one frame');

  const vars: Uint8Array[] = [];
  if (opts.mediaFile) vars.push(varHeader('mf', opts.mediaFile));
  vars.push(varHeader('sp', opts.producer ?? 'Tesla Light Show Maker'));
  const varLen = vars.reduce((n, v) => n + v.length, 0);

  let dataOffset = FIXED_HEADER_LEN + varLen;
  dataOffset = Math.ceil(dataOffset / 4) * 4; // xLights pads to 4 bytes
  if (dataOffset > 0xffff) throw new Error('header too large');

  const out = new Uint8Array(dataOffset + frames.length);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  dv.setUint16(4, dataOffset, true);
  out[6] = 0; // minor
  out[7] = 2; // major
  dv.setUint16(8, FIXED_HEADER_LEN, true);
  dv.setUint32(10, channelCount, true);
  dv.setUint32(14, frameCount, true);
  out[18] = stepTimeMs;
  out[19] = 0;
  out[20] = 0; // uncompressed
  out[21] = 0;
  out[22] = 0;
  out[23] = 0;
  const uid = opts.uniqueId ?? BigInt(Date.now()) * 1000n;
  dv.setBigUint64(24, uid, true);

  let pos = FIXED_HEADER_LEN;
  for (const v of vars) {
    out.set(v, pos);
    pos += v.length;
  }
  out.set(frames, dataOffset);
  return out;
}

/** Parse the header of an FSEQ file (v1 or v2). Throws on malformed input. */
export function parseFseqHeader(bytes: Uint8Array): FseqHeader {
  if (bytes.length < 28) throw new Error('file too short to be an FSEQ');
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error("bad magic, expected 'PSEQ'");
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channelDataOffset = dv.getUint16(4, true);
  const minorVersion = bytes[6];
  const majorVersion = bytes[7];
  const headerLength = dv.getUint16(8, true);
  const channelCount = dv.getUint32(10, true);
  const frameCount = dv.getUint32(14, true);
  const stepTimeMs = bytes[18];
  const flags = bytes[19];
  const compressionType = majorVersion >= 2 ? bytes[20] & 0x0f : 0;
  const compressionBlockCount = majorVersion >= 2 ? bytes[21] : 0;
  const sparseRangeCount = majorVersion >= 2 ? bytes[22] : 0;
  const uniqueId = majorVersion >= 2 && bytes.length >= 32 ? dv.getBigUint64(24, true) : 0n;

  const variableHeaders: { code: string; data: Uint8Array }[] = [];
  if (majorVersion >= 2) {
    let pos = FIXED_HEADER_LEN + compressionBlockCount * 8 + sparseRangeCount * 6;
    while (pos + 4 <= channelDataOffset && pos + 4 <= bytes.length) {
      const len = dv.getUint16(pos, true);
      if (len < 4) break;
      const code = String.fromCharCode(bytes[pos + 2], bytes[pos + 3]);
      const data = bytes.slice(pos + 4, Math.min(pos + len, bytes.length));
      variableHeaders.push({ code, data });
      pos += len;
    }
  }

  return {
    channelDataOffset,
    minorVersion,
    majorVersion,
    headerLength,
    channelCount,
    frameCount,
    stepTimeMs,
    flags,
    compressionType,
    compressionBlockCount,
    sparseRangeCount,
    uniqueId,
    variableHeaders,
  };
}

/** Read frame data from an uncompressed FSEQ. */
export function readFseqFrames(bytes: Uint8Array): { header: FseqHeader; frames: Uint8Array } {
  const header = parseFseqHeader(bytes);
  if (header.compressionType !== 0) throw new Error('only uncompressed FSEQ files are supported');
  const start = header.channelDataOffset;
  const len = header.channelCount * header.frameCount;
  if (start + len > bytes.length) throw new Error('file truncated: frame data shorter than header claims');
  return { header, frames: bytes.slice(start, start + len) };
}

export function variableHeaderText(h: { code: string; data: Uint8Array }): string {
  let end = h.data.length;
  while (end > 0 && h.data[end - 1] === 0) end--;
  return textDecoder.decode(h.data.subarray(0, end));
}
