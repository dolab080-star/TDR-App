import type { ClosureOptions, ShowOptions, StylePreset } from '../lib/show/types';

interface Props {
  options: ShowOptions;
  onChange: (o: ShowOptions) => void;
}

const STYLES: { id: StylePreset; label: string; hint: string }[] = [
  { id: 'chill', label: 'Chill', hint: 'Soft fades and fewer flashes.' },
  { id: 'balanced', label: 'Balanced', hint: 'Beats, hits and a few strobes on the drops.' },
  { id: 'energetic', label: 'Energetic', hint: 'Headlights alternate, strobe fills, everything reacts.' },
];

const CLOSURES: { id: keyof ClosureOptions; label: string; desc: string; warn?: string }[] = [
  { id: 'chargePort', label: 'Charge port', desc: 'Opens and flashes its LED in rainbow colours (3 commands).' },
  { id: 'mirrors', label: 'Mirrors', desc: 'Fold on each drop, unfold a few seconds later.' },
  { id: 'windows', label: 'Windows', desc: 'Dance for up to 20 s on the biggest section, then close.', warn: 'Music gets quieter once windows close.' },
  { id: 'liftgate', label: 'Liftgate / frunk', desc: 'Opens at the start, dances once, closes near the end.', warn: 'Needs clearance behind (or in front of) the car.' },
  { id: 'doorHandles', label: 'Door handles', desc: 'Present on drops, retract afterwards (Model S only).' },
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

      <h3>Moving parts</h3>
      {CLOSURES.map((c) => (
        <label className="toggle" key={c.id}>
          <input
            type="checkbox"
            checked={options.closures[c.id]}
            onChange={(e) => onChange({ ...options, closures: { ...options.closures, [c.id]: e.target.checked } })}
          />
          <span>
            <span className="t">{c.label}</span>
            <br />
            <span className="d">{c.desc}</span>
            {c.warn && (
              <>
                <br />
                <span className="d warn">⚠ {c.warn}</span>
              </>
            )}
          </span>
        </label>
      ))}
      <p className="hint">Falcon and front doors are never commanded. Command counts stay within Tesla's per-show limits.</p>
    </div>
  );
}
