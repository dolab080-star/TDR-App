import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarPreview } from './CarPreview';
import { useAnalysisWorker, type AnalysisProgress } from '../hooks/useAnalysisWorker';
import type { AnalysisResult } from '../lib/audio/analyze';
import { toMono, TARGET_RATE } from '../lib/audio/decode';
import { encodeWav } from '../lib/export/wav';
import { synthDemoTrack } from '../lib/demo/synthDemo';
import { generateShow } from '../lib/show/generator';
import { simulateBrightness } from '../lib/show/simulate';
import { DEFAULT_CLOSURES, DEFAULT_SHOW_OPTIONS, type ShowOptions, type StylePreset } from '../lib/show/types';
import { vehicleProfile } from '../lib/tesla/vehicles';
import { formatDuration } from '../lib/tesla/validator';

const MOVES: { id: StylePreset; label: string; desc: string }[] = [
  { id: 'chill', label: 'Chill', desc: 'Soft fades and DRLs breathing with the music. Fewer flashes, easy on the eyes.' },
  { id: 'balanced', label: 'Standard', desc: 'Beats, hits and a few strobes on the drops — the balanced, do-anything setting.' },
  { id: 'energetic', label: 'Max', desc: 'Headlights alternate, everything strobes on every hit — full send for the big moments.' },
];

const DEMO_OPTIONS: Omit<ShowOptions, 'style'> = {
  intensity: 0.7,
  vehicle: { ...DEFAULT_SHOW_OPTIONS.vehicle, model: 'model-y', year: 2026, powerLiftgate: true },
  closures: {
    ...DEFAULT_CLOSURES,
    windows: { ...DEFAULT_CLOSURES.windows, enabled: true },
    liftgate: { ...DEFAULT_CLOSURES.liftgate, enabled: true },
  },
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The real thing, on the built-in demo beat: the generator runs on the
 * synthesized track and the top-down preview shows lights, windows and
 * liftgate exactly as the exported show would drive them.
 */
interface Props {
  /** Hidden while a full-page panel is open; the beat pauses and the section stays mounted. */
  hidden?: boolean;
}

export function DemoShowcase({ hidden = false }: Props) {
  const runAnalysis = useAnalysisWorker();
  const sectionRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<AnalysisProgress>({ stage: 'Preparing audio', fraction: 0 });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<StylePreset>('balanced');
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        setStatus('loading');
        const demo = synthDemoTrack(TARGET_RATE);
        const wav = encodeWav([demo.left, demo.right], demo.sampleRate);
        const ctx = new OfflineAudioContext(2, demo.left.length, demo.sampleRate);
        const buffer = ctx.createBuffer(2, demo.left.length, demo.sampleRate);
        buffer.copyToChannel(demo.left as Float32Array<ArrayBuffer>, 0);
        buffer.copyToChannel(demo.right as Float32Array<ArrayBuffer>, 1);
        url = URL.createObjectURL(new Blob([wav as BlobPart], { type: 'audio/wav' }));
        const result = await runAnalysis(toMono(buffer), buffer.sampleRate, (p) => {
          if (!cancelled) setProgress(p);
        });
        if (cancelled) return;
        setAudioUrl(url);
        setAnalysis(result);
        setStatus('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [armed, runAnalysis]);

  const options = useMemo<ShowOptions>(() => ({ ...DEMO_OPTIONS, style }), [style]);
  const profile = useMemo(() => vehicleProfile(options.vehicle), [options.vehicle]);
  const show = useMemo(() => (analysis ? generateShow(analysis, options) : null), [analysis, options]);
  const brightness = useMemo(() => (show ? simulateBrightness(show.frames, show.frameCount, show.stepMs, profile.rampingChannels) : null), [show, profile]);

  const getTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setClock(audioRef.current?.currentTime ?? 0), 200);
    return () => clearInterval(id);
  }, [playing]);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (a.ended) a.currentTime = 0;
      void a.play();
    } else {
      a.pause();
    }
  };

  useEffect(() => {
    if (hidden) audioRef.current?.pause();
  }, [hidden]);

  const short = (s: number) => formatDuration(s).replace(/\.\d+$/, '');
  const active = MOVES.find((m) => m.id === style)!;

  return (
    <section className="panel demo" ref={sectionRef} aria-label="Three ways to move" hidden={hidden}>
      <div className="demo-head">
        <h2>Three ways to move</h2>
        <div className="chips" role="group" aria-label="Dance style">
          {MOVES.map((m) => (
            <button key={m.id} className={`chip${style === m.id ? ' on' : ''}`} aria-pressed={style === m.id} onClick={() => setStyle(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="demo-desc">{active.desc}</p>

      {status === 'ready' && show && brightness && analysis ? (
        <>
          <CarPreview brightness={brightness} frames={show.frames} frameCount={show.frameCount} getTime={getTime} profile={profile} />
          <div className="transport">
            <button className="btn primary" onClick={toggle} aria-label={playing ? 'Pause the demo beat' : 'Play the demo beat'}>
              {playing ? '❚❚ Pause' : '▶ Play the demo beat'}
            </button>
            <span className="time">
              {short(clock)} / {short(analysis.duration)}
            </span>
            <span className="hint" style={{ margin: 0 }}>
              Built-in beat, {analysis.bpm.toFixed(0)} BPM — the same engine that scores your songs.
            </span>
          </div>
          <audio ref={audioRef} src={audioUrl ?? undefined} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setClock(0); }} />
        </>
      ) : status === 'error' ? (
        <div className="error">The demo couldn't start in this browser. The tool itself still works — try Chrome or Edge.</div>
      ) : (
        <div className="progress" role="status">
          <div className="title">Preparing the demo beat…</div>
          <div className="bar">
            <div style={{ width: `${Math.max(4, Math.round(progress.fraction * 100))}%` }} />
          </div>
          <div className="stage">{status === 'loading' ? `${progress.stage}…` : 'Scroll here to start it'}</div>
        </div>
      )}
    </section>
  );
}
