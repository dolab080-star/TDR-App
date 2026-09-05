import type { ShowOptions, StylePreset } from '../lib/show/types';

interface Props {
  options: ShowOptions;
  onChange: (o: ShowOptions) => void;
}

const STYLES: { id: StylePreset; label: string; hint: string }[] = [
  { id: 'chill', label: 'Chill', hint: 'Soft fades and fewer flashes.' },
  { id: 'balanced', label: 'Balanced', hint: 'Beats, hits and a few strobes on the drops.' },
  { id: 'energetic', label: 'Energetic', hint: 'Headlights alternate, strobe fills, everything reacts.' },
];

export function SettingsPanel({ options, onChange }: Props) {
  const style = STYLES.find((s) => s.id === options.style)!;
  return (
    <div className="panel">
      <h3>Show style</h3>
      <div className="field">
        <div className="seg" role="radiogroup" aria-label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              className={s.id === options.style ? 'on' : ''}
              role="radio"
              aria-checked={s.id === options.style}
              onClick={() => onChange({ ...options, style: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="hint">{style.hint}</p>
      </div>
      <div className="field">
        <label>
          <span>Intensity</span>
          <b>{Math.round(options.intensity * 100)}%</b>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(options.intensity * 100)}
          onChange={(e) => onChange({ ...options, intensity: Number(e.target.value) / 100 })}
          aria-label="Intensity"
        />
        <p className="hint">Higher reacts to more hits and adds more layers; lower keeps it calm.</p>
      </div>
    </div>
  );
}
