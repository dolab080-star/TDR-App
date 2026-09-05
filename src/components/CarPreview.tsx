import { useEffect, useRef } from 'react';
import { CH, CHANNEL_COUNT } from '../lib/tesla/channels';
import { closureLabel } from '../lib/show/simulate';

interface Props {
  /** frameCount x 48 brightness from simulateBrightness(). */
  brightness: Float32Array | null;
  /** Raw frames, for closure state. */
  frames: Uint8Array | null;
  frameCount: number;
  /** Returns the current playback time in seconds. */
  getTime: () => number;
}

type Color = 'white' | 'amber' | 'red';

interface LightShape {
  ch: number;
  color: Color;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
}

// Top-down car, front at the top. viewBox 0 0 300 560.
const LIGHTS: LightShape[] = [
  // ambient channels 4-6 (drawn as one strip per side)
  { ch: CH.channel4L, color: 'white', x: 66, y: 46, w: 50, h: 4, rx: 2 },
  { ch: CH.channel4R, color: 'white', x: 184, y: 46, w: 50, h: 4, rx: 2 },
  // main beams
  { ch: CH.outerMainBeamL, color: 'white', x: 66, y: 56, w: 26, h: 14, rx: 4 },
  { ch: CH.outerMainBeamR, color: 'white', x: 208, y: 56, w: 26, h: 14, rx: 4 },
  { ch: CH.innerMainBeamL, color: 'white', x: 96, y: 56, w: 20, h: 14, rx: 4 },
  { ch: CH.innerMainBeamR, color: 'white', x: 184, y: 56, w: 20, h: 14, rx: 4 },
  // signature DRL strips
  { ch: CH.signatureL, color: 'white', x: 66, y: 74, w: 50, h: 4, rx: 2 },
  { ch: CH.signatureR, color: 'white', x: 184, y: 74, w: 50, h: 4, rx: 2 },
  // front turns
  { ch: CH.frontTurnL, color: 'amber', x: 120, y: 56, w: 12, h: 14, rx: 3 },
  { ch: CH.frontTurnR, color: 'amber', x: 168, y: 56, w: 12, h: 14, rx: 3 },
  // fogs
  { ch: CH.frontFogL, color: 'white', x: 74, y: 92, w: 22, h: 8, rx: 3 },
  { ch: CH.frontFogR, color: 'white', x: 204, y: 92, w: 22, h: 8, rx: 3 },
  // aux park + side markers
  { ch: CH.auxParkL, color: 'amber', x: 66, y: 84, w: 12, h: 5, rx: 2 },
  { ch: CH.auxParkR, color: 'amber', x: 222, y: 84, w: 12, h: 5, rx: 2 },
  { ch: CH.sideMarkerL, color: 'amber', x: 58, y: 96, w: 6, h: 18, rx: 2 },
  { ch: CH.sideMarkerR, color: 'amber', x: 236, y: 96, w: 6, h: 18, rx: 2 },
  // side repeaters
  { ch: CH.sideRepeaterL, color: 'amber', x: 56, y: 178, w: 7, h: 20, rx: 2 },
  { ch: CH.sideRepeaterR, color: 'amber', x: 237, y: 178, w: 7, h: 20, rx: 2 },
  // rear
  { ch: CH.tailL, color: 'red', x: 66, y: 486, w: 46, h: 10, rx: 3 },
  { ch: CH.tailR, color: 'red', x: 188, y: 486, w: 46, h: 10, rx: 3 },
  { ch: CH.rearTurnL, color: 'amber', x: 114, y: 486, w: 16, h: 10, rx: 3 },
  { ch: CH.rearTurnR, color: 'amber', x: 170, y: 486, w: 16, h: 10, rx: 3 },
  { ch: CH.brakeLights, color: 'red', x: 126, y: 474, w: 48, h: 6, rx: 3 },
  { ch: CH.reverseLights, color: 'white', x: 118, y: 500, w: 18, h: 8, rx: 2 },
  { ch: CH.licensePlate, color: 'white', x: 138, y: 502, w: 24, h: 6, rx: 2 },
  { ch: CH.rearFogLights, color: 'red', x: 142, y: 512, w: 16, h: 5, rx: 2 },
];
// reverse lights are one channel driving two lamps
const REVERSE_R: LightShape = { ch: CH.reverseLights, color: 'white', x: 164, y: 500, w: 18, h: 8, rx: 2 };

const CLOSURE_ROWS: { label: string; chans: number[] }[] = [
  { label: 'Charge port', chans: [CH.chargePort] },
  { label: 'Mirrors', chans: [CH.mirrorL, CH.mirrorR] },
  { label: 'Windows', chans: [CH.windowFrontL, CH.windowRearL, CH.windowFrontR, CH.windowRearR] },
  { label: 'Liftgate', chans: [CH.liftgate] },
  { label: 'Door handles', chans: [CH.doorHandleFrontL, CH.doorHandleRearL, CH.doorHandleFrontR, CH.doorHandleRearR] },
];

export function CarPreview({ brightness, frames, frameCount, getTime }: Props) {
  const lightRefs = useRef<(SVGRectElement | null)[]>([]);
  const mirrorL = useRef<SVGRectElement>(null);
  const mirrorR = useRef<SVGRectElement>(null);
  const chargePort = useRef<SVGCircleElement>(null);
  const liftgate = useRef<SVGRectElement>(null);
  const windowRefs = useRef<(SVGRectElement | null)[]>([]);
  const closureVals = useRef<(HTMLSpanElement | null)[]>([]);
  const hue = useRef(0);

  useEffect(() => {
    let raf = 0;
    let lastFrame = -1;
    const shapes = [...LIGHTS, REVERSE_R];
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!brightness || !frames) return;
      const t = getTime();
      const f = Math.min(frameCount - 1, Math.max(0, Math.floor(t * 50)));
      const row = f * CHANNEL_COUNT;
      hue.current = (hue.current + 6) % 360;
      const cpVal = frames[row + CH.chargePort - 1];
      if (f === lastFrame && cpVal !== 127) return;
      lastFrame = f;
      shapes.forEach((s, i) => {
        const el = lightRefs.current[i];
        if (!el) return;
        const b = brightness[row + s.ch - 1];
        el.style.opacity = String(0.14 + 0.86 * b);
        el.style.filter = b > 0.3 ? `drop-shadow(0 0 ${6 * b}px currentColor)` : 'none';
      });
      // closures
      const mirror = frames[row + CH.mirrorL - 1];
      const folded = mirror === 191;
      if (mirrorL.current) mirrorL.current.setAttribute('width', folded ? '10' : '24');
      if (mirrorR.current) {
        mirrorR.current.setAttribute('width', folded ? '10' : '24');
        mirrorR.current.setAttribute('x', folded ? '244' : '244');
      }
      if (chargePort.current) {
        const c = chargePort.current;
        if (cpVal === 127) c.setAttribute('fill', `hsl(${hue.current} 90% 60%)`);
        else if (cpVal === 63) c.setAttribute('fill', '#3ddc84');
        else if (cpVal === 191) c.setAttribute('fill', '#ffb020');
        else c.setAttribute('fill', '#3a4256');
      }
      if (liftgate.current) {
        const v = frames[row + CH.liftgate - 1];
        liftgate.current.setAttribute('fill', v === 63 || v === 127 ? 'rgba(90,169,255,0.35)' : 'rgba(255,255,255,0.06)');
      }
      const winChans = [CH.windowFrontL, CH.windowRearL, CH.windowFrontR, CH.windowRearR];
      winChans.forEach((ch, i) => {
        const el = windowRefs.current[i];
        if (!el) return;
        const v = frames[row + ch - 1];
        el.setAttribute('fill', v === 127 ? 'rgba(90,169,255,0.45)' : v === 191 ? 'rgba(255,176,32,0.35)' : 'rgba(255,255,255,0.08)');
      });
      CLOSURE_ROWS.forEach((r, i) => {
        const el = closureVals.current[i];
        if (!el) return;
        const v = Math.max(...r.chans.map((ch) => frames[row + ch - 1]));
        const label = closureLabel(v);
        if (el.textContent !== label) {
          el.textContent = label;
          el.className = `val${label !== 'idle' ? ' active' : ''}`;
        }
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [brightness, frames, frameCount, getTime]);

  const shapes = [...LIGHTS, REVERSE_R];
  return (
    <div className="preview">
      <div className="car-wrap">
        <svg className="car" viewBox="0 0 300 560" role="img" aria-label="Car light preview">
          <defs>
            <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a3142" />
              <stop offset="1" stopColor="#151924" />
            </linearGradient>
          </defs>
          {/* mirrors */}
          <rect ref={mirrorL} x="32" y="150" width="24" height="10" rx="4" fill="#3a4256" />
          <rect ref={mirrorR} x="244" y="150" width="24" height="10" rx="4" fill="#3a4256" />
          {/* body */}
          <path
            d="M150 26 C 210 26 238 44 240 90 L 242 470 C 242 500 232 520 150 522 C 68 520 58 500 58 470 L 60 90 C 62 44 90 26 150 26 Z"
            fill="url(#body)"
            stroke="#3a4256"
            strokeWidth="2"
          />
          {/* glass */}
          <path d="M150 118 C 200 118 214 134 216 160 L 218 210 L 82 210 L 84 160 C 86 134 100 118 150 118 Z" fill="rgba(255,255,255,0.06)" />
          <rect x="82" y="216" width="136" height="150" rx="6" fill="rgba(255,255,255,0.03)" />
          <rect ref={liftgate} x="84" y="372" width="132" height="80" rx="10" fill="rgba(255,255,255,0.06)" />
          {/* windows */}
          <rect ref={(el) => { windowRefs.current[0] = el; }} x="72" y="218" width="8" height="70" rx="3" fill="rgba(255,255,255,0.08)" />
          <rect ref={(el) => { windowRefs.current[1] = el; }} x="72" y="296" width="8" height="70" rx="3" fill="rgba(255,255,255,0.08)" />
          <rect ref={(el) => { windowRefs.current[2] = el; }} x="220" y="218" width="8" height="70" rx="3" fill="rgba(255,255,255,0.08)" />
          <rect ref={(el) => { windowRefs.current[3] = el; }} x="220" y="296" width="8" height="70" rx="3" fill="rgba(255,255,255,0.08)" />
          {/* charge port */}
          <circle ref={chargePort} cx="66" cy="446" r="6" fill="#3a4256" />
          {/* lights */}
          {shapes.map((s, i) => (
            <rect
              key={`${s.ch}-${i}`}
              ref={(el) => { lightRefs.current[i] = el; }}
              className={`light ${s.color}`}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.rx ?? 2}
              style={{ opacity: 0.14 }}
            />
          ))}
        </svg>
      </div>
      <div>
        <div className="legend">
          {CLOSURE_ROWS.map((r, i) => (
            <div className="row" key={r.label}>
              <span>{r.label}</span>
              <span className="val" ref={(el) => { closureVals.current[i] = el; }}>
                idle
              </span>
            </div>
          ))}
        </div>
        <p className="hint">
          Preview approximates the car: ramping lights fade, boolean lights snap, closures show their commanded state. Actual lights
          vary by model (e.g. Model 3/Y share one output for Channels 4–6).
        </p>
      </div>
    </div>
  );
}
