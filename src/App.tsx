import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropZone } from './components/DropZone';
import { CarPreview } from './components/CarPreview';
import { Timeline } from './components/Timeline';
import { SettingsPanel } from './components/SettingsPanel';
import { StatsPanel } from './components/StatsPanel';
import { DownloadPanel, type AudioChoice } from './components/DownloadPanel';
import { useAnalysisWorker, type AnalysisProgress } from './hooks/useAnalysisWorker';
import { decodeToBuffer, toExportChannels, toMono, TARGET_RATE } from './lib/audio/decode';
import type { AnalysisResult } from './lib/audio/analyze';
import { generateShow } from './lib/show/generator';
import { simulateBrightness } from './lib/show/simulate';
import { DEFAULT_SHOW_OPTIONS, type ShowOptions } from './lib/show/types';
import { encodeFseq } from './lib/tesla/fseq';
import { formatDuration, validateFseq } from './lib/tesla/validator';
import { encodeWav } from './lib/export/wav';
import { canPassThrough, sniffAudio, type AudioInfo } from './lib/export/audioInfo';
import { buildShowZip, downloadBlob, sanitizeBaseName } from './lib/export/zip';
import { synthDemoTrack } from './lib/demo/synthDemo';

interface LoadedSong {
  name: string;
  bytes: Uint8Array;
  info: AudioInfo;
  buffer: AudioBuffer;
  /** URL for the <audio> element. */
  playbackUrl: string;
  isDemo: boolean;
}

type Phase = { kind: 'idle' } | { kind: 'decoding'; name: string } | { kind: 'analyzing'; name: string; progress: AnalysisProgress } | { kind: 'ready' };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [options, setOptions] = useState<ShowOptions>(DEFAULT_SHOW_OPTIONS);
  const [useSongName, setUseSongName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [audioChoice, setAudioChoice] = useState<AudioChoice['id']>('original');
  const [packing, setPacking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const runAnalysis = useAnalysisWorker();

  // Revoke object URLs when a song is replaced.
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
        setCustomName(sanitizeBaseName(name));
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
  const show = useMemo(() => (analysis ? generateShow(analysis, options) : null), [analysis, options]);
  const brightness = useMemo(() => (show ? simulateBrightness(show.frames, show.frameCount) : null), [show]);
  const audioExt: 'wav' | 'mp3' = song && audioChoice === 'original' && song.info.container === 'mp3' ? 'mp3' : 'wav';
  const baseName = useSongName ? sanitizeBaseName(customName || song?.name || 'lightshow') : 'lightshow';
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
        songTitle: song.name,
        bpm: analysis.bpm,
        durationS: analysis.duration,
      });
      downloadBlob(blob, `${sanitizeBaseName(song.name)}_LightShow.zip`);
    } finally {
      setPacking(false);
    }
  }, [song, fseqBytes, analysis, audioBytes, audioExt, baseName]);

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
      if (e.code === 'Space' && phase.kind === 'ready' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
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
    setPhase({ kind: 'idle' });
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">T</div>
          <div>
            <h1>Tesla Light Show Maker</h1>
            <p>Drop in a song, get a beat-synced light show for your car.</p>
          </div>
        </div>
        <div className="actions">
          {phase.kind === 'ready' && (
            <button className="btn" onClick={reset}>
              ↺ New song
            </button>
          )}
        </div>
      </header>

      {error && <div className="error">⚠ {error}</div>}

      {phase.kind === 'idle' && <DropZone onFile={onFile} onDemo={onDemo} />}

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
                  <div className="title" title={song.name}>
                    {song.name}
                  </div>
                  <div className="meta">
                    {formatDuration(analysis.duration)} · {analysis.bpm.toFixed(1)} BPM · {analysis.bars.length} bars · {analysis.sections.length} sections
                  </div>
                </div>
                <div className="chips">
                  {show.events
                    .filter((e) => e.kind === 'drop')
                    .slice(0, 4)
                    .map((e, i) => (
                      <button className="chip" key={i} onClick={() => seek(e.time)}>
                        Drop <b>{formatDuration(e.time).replace(/\.\d+$/, '')}</b>
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="panel">
              <CarPreview brightness={brightness} frames={show.frames} frameCount={show.frameCount} getTime={getTime} />
              <div className="transport">
                <button className="btn primary" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <span className="time">
                  {formatDuration(clock).replace(/\.\d+$/, '')} / {formatDuration(analysis.duration).replace(/\.\d+$/, '')}
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
            <SettingsPanel options={options} onChange={setOptions} />
            <DownloadPanel
              baseName={baseName}
              songBaseName={sanitizeBaseName(customName || song.name)}
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
            />
          </div>
        </div>
      )}

      <footer className="footer">
        Not affiliated with Tesla. Show format per{' '}
        <a href="https://github.com/teslamotors/light-show" target="_blank" rel="noreferrer">
          teslamotors/light-show
        </a>
        . Park with room around the car before running a show with moving parts.
      </footer>
    </div>
  );
}
