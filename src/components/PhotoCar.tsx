import { useEffect, useRef } from 'react';
import { choreograph, STATIC_STATE, type LampState, type Pace } from '../lib/car3d/choreo';

/**
 * The real car: a photo of a red 2026 Model Y with its lamps re-lit per
 * frame. Lamp shapes are drawn in the photo's own pixel space (1200 x 800)
 * so swapping the picture only means updating the coordinates below.
 */
const PHOTO = { src: '/hero/model-y-2026.webp', width: 1200, height: 800 };

const BAR_PATH = 'M603 446 Q846 470 1150 441';
const TURN_LEFT_PATH = 'M603 446 Q636 449 672 451';
const TURN_RIGHT_PATH = 'M1082 447 Q1118 445 1150 441';
const HEADLIGHT_POINTS = '664,510 786,504 790,540 670,545';

interface GlowSpec {
  key: keyof LampState | 'ground';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  gain: number;
}

const GLOWS: GlowSpec[] = [
  { key: 'bar', x: 876, y: 454, w: 640, h: 90, color: '255,255,255', gain: 0.75 },
  { key: 'headR', x: 715, y: 525, w: 300, h: 130, color: '235,242,255', gain: 0.9 },
  { key: 'headL', x: 1168, y: 545, w: 120, h: 90, color: '235,242,255', gain: 0.55 },
  { key: 'turnL', x: 636, y: 449, w: 170, h: 70, color: '255,170,40', gain: 0.8 },
  { key: 'turnR', x: 1118, y: 444, w: 150, h: 70, color: '255,170,40', gain: 0.8 },
  { key: 'ground', x: 880, y: 712, w: 760, h: 150, color: '255,255,255', gain: 0.45 },
];

interface Props {
  pace: Pace;
}

export function PhotoCar({ pace }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const paceRef = useRef(pace);
  const lampRefs = useRef<Record<string, (SVGElement | HTMLElement)[]>>({});
  paceRef.current = pace;

  const bind = (key: string) => (el: SVGElement | HTMLElement | null) => {
    if (!el) return;
    const list = (lampRefs.current[key] ??= []);
    if (!list.includes(el)) list.push(el);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const set = (key: string, value: number) => {
      for (const el of lampRefs.current[key] ?? []) el.style.opacity = value.toFixed(3);
    };
    const apply = (s: LampState) => {
      set('bar', s.bar);
      set('bar-off', 1 - s.bar);
      set('headR', s.headR);
      set('headL', s.headL);
      set('turnL', s.turnL);
      set('turnR', s.turnR);
      set('ground', Math.min(1, s.bar * 0.5 + Math.max(s.headL, s.headR) * 0.6));
      stage.style.transform = `translateY(${(-s.bob * 240).toFixed(2)}px) rotate(${s.roll.toFixed(4)}rad) scale(${(1 + s.bob * 0.5).toFixed(4)})`;
    };

    if (reduceMotion) {
      apply(STATIC_STATE);
      return;
    }

    let raf = 0;
    let running = false;
    let last = 0;
    let clock = 0;
    let visible = true;
    const frame = (now: number) => {
      if (!running) return;
      if (last) clock += Math.min(0.05, (now - last) / 1000);
      last = now;
      apply(choreograph(paceRef.current, clock));
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const should = visible && !document.hidden;
      if (should && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.05 },
    );
    io.observe(stage);
    document.addEventListener('visibilitychange', sync);
    apply(choreograph(paceRef.current, 0));
    sync();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(2)}%`;

  return (
    <div className="photo-car" role="img" aria-label="A red 2026 Tesla Model Y with its light bar and headlights flashing to the beat">
      <div className="photo-car-stage" ref={stageRef}>
        <img src={PHOTO.src} width={PHOTO.width} height={PHOTO.height} alt="" draggable={false} fetchPriority="high" decoding="async" />
        {GLOWS.map((g) => (
          <span
            key={g.key + g.x}
            ref={bind(g.key)}
            className="photo-glow"
            style={{
              left: pct(g.x, PHOTO.width),
              top: pct(g.y, PHOTO.height),
              width: pct(g.w, PHOTO.width),
              height: pct(g.h, PHOTO.height),
              background: `radial-gradient(ellipse at center, rgba(${g.color},${g.gain}) 0%, rgba(${g.color},${g.gain * 0.45}) 30%, rgba(${g.color},0) 70%)`,
            }}
          />
        ))}
        <svg className="photo-lamps" viewBox={`0 0 ${PHOTO.width} ${PHOTO.height}`} preserveAspectRatio="none" aria-hidden="true">
          <path ref={bind('bar-off')} d={BAR_PATH} className="lamp-off" />
          <path ref={bind('bar')} d={BAR_PATH} className="lamp-bar" />
          <path ref={bind('bar')} d={BAR_PATH} className="lamp-bar-core" />
          <path ref={bind('turnL')} d={TURN_LEFT_PATH} className="lamp-turn" />
          <path ref={bind('turnR')} d={TURN_RIGHT_PATH} className="lamp-turn" />
          <polygon ref={bind('headR')} points={HEADLIGHT_POINTS} className="lamp-head" />
        </svg>
      </div>
      <div className="photo-car-vignette" aria-hidden="true" />
    </div>
  );
}
