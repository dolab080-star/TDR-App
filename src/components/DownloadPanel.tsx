import { useState } from 'react';
import { restoreUrl, type License } from '../lib/license';
import { UsbInstructions } from './UsbInstructions';

export interface AudioChoice {
  id: 'original' | 'wav';
  label: string;
  detail: string;
}

interface Props {
  baseName: string;
  /** Sanitised song name, shown as the alternative to `lightshow`. */
  songBaseName: string;
  onBaseNameChange: (name: string) => void;
  useSongName: boolean;
  onUseSongNameChange: (v: boolean) => void;
  audioChoices: AudioChoice[];
  audioChoice: AudioChoice['id'];
  onAudioChoiceChange: (id: AudioChoice['id']) => void;
  audioExt: 'wav' | 'mp3';
  busy: boolean;
  onDownloadZip: () => Promise<void>;
  onDownloadFseq: () => void;
  onDownloadAudio: () => Promise<void>;
  disabled: boolean;
  license: License;
}

export function DownloadPanel(p: Props) {
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<void> | void) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const restore = restoreUrl(p.license);

  return (
    <div className="panel download">
      <div className="songbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Put it on your car</h3>
        <span className="chip unlocked">✓ Full version</span>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={p.useSongName} onChange={(e) => p.onUseSongNameChange(e.target.checked)} />
        <span>
          <span className="t">Name files after the song</span>
          <br />
          <span className="d">
            Off = <code>lightshow.fseq</code> (works on every software version). On = <code>{p.songBaseName}.fseq</code>, which lets
            you keep several shows on one stick (2023.44.25+).
          </span>
        </span>
      </label>
      {p.useSongName && (
        <div className="field">
          <label>
            <span>File name</span>
          </label>
          <input className="select" value={p.baseName} onChange={(e) => p.onBaseNameChange(e.target.value)} aria-label="File name" />
        </div>
      )}
      {p.audioChoices.length > 1 && (
        <div className="field">
          <label>
            <span>Audio file</span>
          </label>
          <select className="select" value={p.audioChoice} onChange={(e) => p.onAudioChoiceChange(e.target.value as AudioChoice['id'])}>
            {p.audioChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.detail}
              </option>
            ))}
          </select>
        </div>
      )}
      {p.audioChoices.length === 1 && <p className="hint">{p.audioChoices[0].detail}</p>}
      <button className="btn primary big" disabled={p.disabled || p.busy} onClick={() => run(p.onDownloadZip)}>
        {p.busy ? 'Packing…' : '⬇ Download LightShow.zip'}
      </button>
      <div className="files">
        <button className="btn" disabled={p.disabled || p.busy} onClick={() => run(p.onDownloadFseq)}>
          .fseq only
        </button>
        <button className="btn" disabled={p.disabled || p.busy} onClick={() => run(p.onDownloadAudio)}>
          .{p.audioExt} only
        </button>
      </div>
      {err && (
        <p className="hint" style={{ color: 'var(--accent-2)' }}>
          {err}
        </p>
      )}
      <UsbInstructions />
      {restore && (
        <details className="caps">
          <summary>Setting this up on another device?</summary>
          <p className="hint">
            Open this link there to unlock it too — it's your receipt: <code>{restore}</code>
          </p>
        </details>
      )}
    </div>
  );
}
