import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropZone } from './components/DropZone';
import { CarPreview } from './components/CarPreview';
import { Timeline } from './components/Timeline';
import { SettingsPanel } from './components/SettingsPanel';
import { VehiclePanel } from './components/VehiclePanel';
import { ClosuresPanel } from './components/ClosuresPanel';
import { StatsPanel } from './components/StatsPanel';
import { DownloadPanel, type AudioChoice } from './components/DownloadPanel';
import { InstallPanel } from './components/InstallPanel';
import { YouTubeLink } from './components/YouTubeLink';
import { PurchaseBanner } from './components/PurchaseBanner';
import { Home } from './components/Home';
import { useAnalysisWorker, type AnalysisProgress } from './hooks/useAnalysisWorker';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useLicense } from './hooks/useLicense';
import { decodeToBuffer, toExportChannels, toMono, TARGET_RATE } from './lib/audio/decode';
import type { AnalysisResult } from './lib/audio/analyze';
import { generateShow } from './lib/show/generator';
import { simulateBrightness } from './lib/show/simulate';
import { DEFAULT_CLOSURES, DEFAULT_SHOW_OPTIONS, type ShowOptions } from './lib/show/types';
import { vehicleProfile } from './lib/tesla/vehicles';
import { encodeFseq } from './lib/tesla/fseq';
import { formatDuration, validateFseq } from './lib/tesla/validator';
import { encodeWav } from './lib/export/wav';
import { canPassThrough, sniffAudio, type AudioInfo } from './lib/export/audioInfo';
import { buildShowZip, downloadBlob, sanitizeBaseName } from './lib/export/zip';
import { synthDemoTrack } from './lib/demo/synthDemo';
import { durationMismatch, type LinkedVideo } from './lib/youtube';

interface LoadedSong {
  name: string;
  bytes: Uint8Array;
  info: AudioInfo;
  buffer: AudioBuffer;
  playbackUrl: string;
  isDemo: boolean;
}

type Phase = { kind: 'idle' } | { kind: 'decoding'; name: string } | { kind: 'analyzing'; name: string; progress: AnalysisProgress } | { kind: 'ready' };

const SETTINGS_KEY = 'tesla-lightshow-maker.settings.v2';

function loadSavedOptions(): ShowOptions {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SHOW_OPTIONS;
    const saved = JSON.parse(raw) as Partial<ShowOptions>;
    const closures = { ...DEFAULT_CLOSURES };
    for (const key of Object.keys(DEFAULT_CLOSURES) as (keyof typeof DEFAULT_CLOSURES)[]) {
      const s = saved.closures?.[key];
      if (s && typeof s === 'object') closures[key] = { ...DEFAULT_CLOSURES[key], ...s } as never;
    }
    return {
      style: saved.style ?? DEFAULT_SHOW_OPTIONS.style,
      intensity: typeof saved.intensity === 'number' ? saved.intensity : DEFAULT_SHOW_OPTIONS.intensity,
      vehicle: { ...DEFAULT_SHOW_OPTIONS.vehicle, ...(saved.vehicle ?? {}) },
      closures,
    };
  } catch {
    return DEFAULT_SHOW_OPTIONS;
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [options, setOptions] = useState<ShowOptions>(loadSavedOptions);
  const [useSongName, setUseSongName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [audioChoice, setAudioChoice] = useState<AudioChoice['id']>('original');
  const [packing, setPacking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<LinkedVideo | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const runAnalysis = useAnalysisWorker();
  const install = useInstallPrompt();
  const { license, purchaseCheck, dismissPurchaseCheck } = useLicense();

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(options));
    } catch {
      /* private mode or storage full: settings just won't persist */
    }
  }, [options]);

  useEffect(() => {
    return () => {
      if (song?.playbackUrl) URL.revokeObjectURL(song.playbackUrl);
    };
  }, [song]);

  const load = useCallback(
    async (name: string, bytes: Uint8Array, buffer: AudioBuffer | null, isDemo: boolean, playbackBlob: Blob) => {
      setError(null);
      setAnalysis(null);
      setSong(null);
      setPlaying(false);
      try {
        setPhase({ kind: 'decoding', name });
        const buf = buffer ?? (await decodeToBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
        const info = isDemo ? { container: 'wav' as const, sampleRate: TARGET_RATE, channels: 2, bitsPerSample: 16, pcm: true } : sniffAudio(bytes);
        const loaded: LoadedSong = { name, bytes, info, buffer: buf, playbackUrl: URL.createObjectURL(playbackBlob), isDemo };
        setSong(loaded);
        setCustomName('');
        setAudioChoice(canPassThrough(info) ? 'original' : 'wav');
        setPhase({ kind: 'analyzing', name, progress: { stage: 'Preparing audio', fraction: 0 } });
        const mono = toMono(buf);
        const result = await runAnalysis(mono, buf.sampleRate, (progress) => setPhase({ kind: 'analyzing', name, progress }));
        setAnalysis(result);
        setPhase({ kind: 'ready' });
      } catch (e) {
        console.error(e);
        setError((e as Error).message || 'Could not read that file.');
        setPhase({ kind: 'idle' });
      }
    },
    [runAnalysis],
  );

  const onFile = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await load(file.name, bytes, null, false, file);
    },
    [load],
  );

  const onDemo = useCallback(async () => {
    const demo = synthDemoTrack(TARGET_RATE);
    const wav = encodeWav([demo.left, demo.right], demo.sampleRate);
    const ctx = new OfflineAudioContext(2, demo.left.length, demo.sampleRate);
    const buffer = ctx.createBuffer(2, demo.left.length, demo.sampleRate);
    buffer.copyToChannel(demo.left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(demo.right as Float32Array<ArrayBuffer>, 1);
    await load('Demo Beat.wav', wav, buffer, true, new Blob([wav as BlobPart], { type: 'audio/wav' }));
  }, [load]);

  // --- derived show ---------------------------------------------------------
  const profile = useMemo(() => vehicleProfile(options.vehicle), [options.vehicle]);
  const show = useMemo(() => (analysis ? generateShow(analysis, options) : null), [analysis, options]);
  const brightness = useMemo(() => (show ? simulateBrightness(show.frames, show.frameCount, show.stepMs, profile.rampingChannels) : null), [show, profile]);
  const audioExt: 'wav' | 'mp3' = song && audioChoice === 'original' && song.info.container === 'mp3' ? 'mp3' : 'wav';
  const songTitle = video?.title ?? song?.name ?? 'lightshow';
  const songBaseName = sanitizeBaseName(customName || songTitle);
  const baseName = useSongName ? songBaseName : 'lightshow';
  const fseqBytes = useMemo(
    () => (show ? encodeFseq(show.frames, { channelCount: 48, stepTimeMs: show.stepMs, mediaFile: `${baseName}.${audioExt}` }) : null),
    [show, baseName, audioExt],
  );
  const report = useMemo(() => (fseqBytes ? validateFseq(fseqBytes) : null), [fseqBytes]);

  const audioChoices: AudioChoice[] = useMemo(() => {
    if (!song) return [];
    const wavChoice: AudioChoice = { id: 'wav', label: 'Convert to WAV', detail: '44.1 kHz 16-bit PCM, the format Tesla recommends' };
    if (song.isDemo) return [wavChoice];
    if (canPassThrough(song.info)) {
      const ext = song.info.container === 'mp3' ? 'MP3' : 'WAV';
      return [{ id: 'original', label: `Keep original ${ext}`, detail: `${(song.bytes.length / 1048576).toFixed(1)} MB, already 44.1 kHz` }, wavChoice];
    }
    const why =
      song.info.sampleRate && song.info.sampleRate !== TARGET_RATE
        ? `Original is ${song.info.sampleRate / 1000} kHz; Tesla needs 44.1 kHz so it will be converted to WAV.`
        : 'Original format is not .mp3/.wav 44.1 kHz; it will be converted to WAV.';
    return [{ ...wavChoice, detail: why }];
  }, [song]);

  const audioBytes = useCallback(async (): Promise<Uint8Array> => {
    if (!song) throw new Error('No song loaded');
    if (audioChoice === 'original' && canPassThrough(song.info) && !song.isDemo) return song.bytes;
    return encodeWav(toExportChannels(song.buffer), song.buffer.sampleRate);
  }, [song, audioChoice]);

  const onDownloadZip = useCallback(async () => {
    if (!song || !fseqBytes || !analysis) return;
    setPacking(true);
    try {
      const audio = await audioBytes();
      const blob = await buildShowZip({
        fseq: fseqBytes,
        audio,
        audioExt,
        baseName,
        songTitle,
        bpm: analysis.bpm,
        durationS: analysis.duration,
      });
      downloadBlob(blob, `${sanitizeBaseName(songTitle)}_LightShow.zip`);
    } finally {
      setPacking(false);
    }
  }, [song, fseqBytes, analysis, audioBytes, audioExt, baseName, songTitle]);

  const onDownloadFseq = useCallback(() => {
    if (!fseqBytes) return;
    downloadBlob(new Blob([fseqBytes as BlobPart], { type: 'application/octet-stream' }), `${baseName}.fseq`);
  }, [fseqBytes, baseName]);

  const onDownloadAudio = useCallback(async () => {
    const audio = await audioBytes();
    downloadBlob(new Blob([audio as BlobPart], { type: audioExt === 'mp3' ? 'audio/mpeg' : 'audio/wav' }), `${baseName}.${audioExt}`);
  }, [audioBytes, audioExt, baseName]);

  // --- playback -------------------------------------------------------------
  const getTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);
  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);
  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if (e.code === 'Space' && phase.kind === 'ready' && !typing) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase.kind, togglePlay]);

  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const id = setInterval(() => setClock(audioRef.current?.currentTime ?? 0), 200);
    return () => clearInterval(id);
  }, [phase.kind]);

  const reset = () => {
    audioRef.current?.pause();
    setSong(null);
    setAnalysis(null);
    setVideo(null);
    setPhase({ kind: 'idle' });
    setError(null);
  };

  const short = (s: number) => formatDuration(s).replace(/\.\d+$/, '');
  const licensed = license.licensed;

  return (
    <div className="app">
      <header className="header header-centered">
        {licensed && (
          <div className="header-corner">
            {!install.installed && (
              <button
                className="btn"
                onClick={() => {
                  if (install.canInstall) void install.promptInstall();
                  else setShowInstall((v) => !v);
                }}
              >
                ⬇ Install app
              </button>
            )}
            {phase.kind === 'ready' && (
              <button className="btn" onClick={reset}>
                ↺ New song
              </button>
            )}
          </div>
        )}
        <p className="eyebrow site-tag">TDR</p>
        <h1>Tesla Dance Revolution</h1>
        <p className="tagline">Drop in a song, get a beat-synced light show for your car.</p>
      </header>

      {error && <div className="error">⚠ {error}</div>}
      <PurchaseBanner status={purchaseCheck} license={license} onDismiss={dismissPurchaseCheck} />

      {!licensed ? (
        <Home install={install} />
      ) : (
        <>
          {(showInstall || (phase.kind === 'idle' && !install.installed)) && <InstallPanel install={install} onClose={showInstall ? () => setShowInstall(false) : undefined} />}

          {/* Kept mounted (hidden) outside "idle" so a metadata lookup started just
              before the user drops a file still finishes and reaches onVideo. */}
          <YouTubeLink video={video} onVideo={setVideo} hidden={phase.kind !== 'idle'} />
          {phase.kind === 'idle' && (
            <DropZone
              onFile={onFile}
              onDemo={onDemo}
              heading={video ? `Drop the audio file for “${video.title ?? 'this video'}”` : undefined}
              compact={!!video}
              hideDemo={!!video}
            />
          )}

          {(phase.kind === 'decoding' || phase.kind === 'analyzing') && (
            <div className="progress">
              <div className="title">{phase.name}</div>
              <div className="bar">
                <div style={{ width: `${phase.kind === 'analyzing' ? Math.round(phase.progress.fraction * 100) : 4}%` }} />
              </div>
              <div className="stage">{phase.kind === 'decoding' ? 'Decoding audio…' : `${phase.progress.stage}…`}</div>
            </div>
          )}

          {phase.kind === 'ready' && song && analysis && show && brightness && fseqBytes && report && (
            <div className="workspace">
              <div className="stack">
                <div className="panel">
                  <div className="songbar">
                    <div>
                      <div className="title" title={songTitle}>
                        {songTitle}
                      </div>
                      <div className="meta">
                        {video && (
                          <>
                            <a href={video.url} target="_blank" rel="noreferrer">
                              YouTube
                            </a>{' '}
                            · audio from {song.name} ·{' '}
                          </>
                        )}
                        {formatDuration(analysis.duration)} · {analysis.bpm.toFixed(1)} BPM · {analysis.bars.length} bars · {analysis.sections.length} sections ·{' '}
                        {profile.label}
                      </div>
                    </div>
                    <div className="chips">
                      {show.events
                        .filter((e) => e.kind === 'drop')
                        .slice(0, 4)
                        .map((e, i) => (
                          <button className="chip" key={i} onClick={() => seek(e.time)}>
                            Drop <b>{short(e.time)}</b>
                          </button>
                        ))}
                    </div>
                  </div>
                  {video && durationMismatch(video.duration, analysis.duration) && (
                    <div className="mismatch">
                      ⚠ The YouTube video is {short(video.duration!)} long but this audio file is {short(analysis.duration)}. They look like different
                      versions, so the show may not line up with the video you had in mind. The show is generated from the audio file, so it will
                      still match the file.
                    </div>
                  )}
                </div>
                <div className="panel">
                  <CarPreview brightness={brightness} frames={show.frames} frameCount={show.frameCount} getTime={getTime} profile={profile} />
                  <div className="transport">
                    <button className="btn primary" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                      {playing ? '❚❚ Pause' : '▶ Play'}
                    </button>
                    <span className="time">
                      {short(clock)} / {short(analysis.duration)}
                    </span>
                    <span className="hint" style={{ margin: 0 }}>
                      Space to play/pause · click the timeline to seek
                    </span>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Timeline analysis={analysis} events={show.events} getTime={getTime} onSeek={seek} />
                  </div>
                  <audio
                    ref={audioRef}
                    src={song.playbackUrl}
                    preload="auto"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => setError('This browser cannot play the original file; the show data is still fine. Try Chrome or convert to WAV/MP3.')}
                  />
                </div>
                <StatsPanel analysis={analysis} report={report} fseqBytes={fseqBytes.length} />
              </div>
              <div className="stack">
                <VehiclePanel vehicle={options.vehicle} onChange={(vehicle) => setOptions({ ...options, vehicle })} />
                <SettingsPanel options={options} onChange={setOptions} />
                <ClosuresPanel
                  closures={options.closures}
                  onChange={(closures) => setOptions({ ...options, closures })}
                  profile={profile}
                  usage={report.closureUsage}
                  warnings={show.warnings}
                  getTime={getTime}
                  duration={analysis.duration}
                />
                <DownloadPanel
                  baseName={baseName}
                  songBaseName={songBaseName}
                  onBaseNameChange={setCustomName}
                  useSongName={useSongName}
                  onUseSongNameChange={setUseSongName}
                  audioChoices={audioChoices}
                  audioChoice={audioChoice}
                  onAudioChoiceChange={setAudioChoice}
                  audioExt={audioExt}
                  busy={packing}
                  disabled={!report.ok}
                  onDownloadZip={onDownloadZip}
                  onDownloadFseq={onDownloadFseq}
                  onDownloadAudio={onDownloadAudio}
                  license={license}
                />
              </div>
            </div>
          )}
        </>
      )}

      <footer className="footer">
        Tesla Dance Revolution is an independent, fan-made tool — not affiliated with, endorsed by, or sponsored by Tesla, Inc. Use at
        your own risk: we assume no responsibility for vehicle damage, injury, or copyright issues arising from use of this tool. Show
        format per{' '}
        <a href="https://github.com/teslamotors/light-show" target="_blank" rel="noreferrer">
          teslamotors/light-show
        </a>
        . Park with room around the car before running a show with moving parts.
      </footer>
    </div>
  );
}
