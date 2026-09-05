import { useState, type ReactNode } from 'react';
import type { VehicleProfile } from '../lib/tesla/vehicles';
import type { ValidationReport } from '../lib/tesla/validator';
import type { ClosureOptions, MoveTrigger, OpenDanceCloseOptions } from '../lib/show/types';
import { formatTime, formatTimeList, parseTime, parseTimeList } from '../lib/time';

interface Props {
  closures: ClosureOptions;
  onChange: (c: ClosureOptions) => void;
  profile: VehicleProfile;
  usage: ValidationReport['closureUsage'];
  warnings: string[];
  /** Current playhead time, for the "add cue here" buttons. */
  getTime: () => number;
  duration: number;
}

const GROUP_KEY: Record<keyof ClosureOptions, ValidationReport['closureUsage'][number]['group']> = {
  chargePort: 'chargePort',
  mirrors: 'mirrors',
  windows: 'windows',
  liftgate: 'liftgate',
  doorHandles: 'doorHandles',
  falconDoors: 'falconDoors',
  frontDoors: 'frontDoors',
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function TimeInput({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const [text, setText] = useState(formatTime(value));
  return (
    <input
      className="select mono"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = parseTime(text);
        if (t != null) {
          const v = Math.min(max, t);
          onChange(v);
          setText(formatTime(v));
        } else setText(formatTime(value));
      }}
      placeholder="m:ss"
      aria-label="Time"
    />
  );
}

function TimesInput({ values, onChange, getTime, max }: { values: number[]; onChange: (v: number[]) => void; getTime: () => number; max: number }) {
  const [text, setText] = useState(formatTimeList(values));
  const commit = (next: number[]) => {
    const clean = [...new Set(next.map((t) => Math.min(max, Math.max(0, t))))].sort((a, b) => a - b);
    onChange(clean);
    setText(formatTimeList(clean));
  };
  return (
    <div className="times">
      <input
        className="select mono"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(parseTimeList(text))}
        placeholder="e.g. 0:32, 1:04, 1:36"
        aria-label="Cue times"
      />
      <button className="btn" type="button" onClick={() => commit([...parseTimeList(text), getTime()])}>
        + at playhead
      </button>
    </div>
  );
}

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Range({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        <b>
          {value} {unit}
        </b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

const OPEN_AT: [OpenDanceCloseOptions['openAt'], string][] = [
  ['start', 'When the music starts'],
  ['firstDrop', 'On the first drop'],
  ['custom', 'At a time I choose'],
];
const MOVE_TRIGGER: [MoveTrigger, string][] = [
  ['drops', 'On every drop'],
  ['firstDrop', 'On the first drop only'],
  ['loudest', 'At the loudest section'],
  ['custom', 'At times I choose'],
];

export function ClosuresPanel({ closures, onChange, profile, usage, warnings, getTime, duration }: Props) {
  const avail = profile.closures;
  const set = <K extends keyof ClosureOptions>(key: K, patch: Partial<ClosureOptions[K]>) =>
    onChange({ ...closures, [key]: { ...closures[key], ...patch } });
  const used = (key: keyof ClosureOptions) => usage.find((u) => u.group === GROUP_KEY[key]);

  const block = (key: keyof ClosureOptions, title: string, desc: string, available: boolean, unavailableNote: string, body: ReactNode, warn?: string) => {
    const u = used(key);
    const enabled = closures[key].enabled;
    return (
      <div className={`closure${enabled && available ? ' on' : ''}`} key={key}>
        <label className="toggle">
          <input type="checkbox" checked={enabled} disabled={!available} onChange={(e) => set(key, { enabled: e.target.checked } as Partial<ClosureOptions[typeof key]>)} />
          <span style={{ flex: 1 }}>
            <span className="t">
              {title}
              {u && u.used > 0 && (
                <span className="usage-pill">
                  {u.used} / {u.limit} commands
                </span>
              )}
            </span>
            <br />
            <span className="d">{available ? desc : unavailableNote}</span>
            {warn && available && (
              <>
                <br />
                <span className="d warn">⚠ {warn}</span>
              </>
            )}
          </span>
        </label>
        {enabled && available && <div className="closure-body">{body}</div>}
      </div>
    );
  };

  const openDanceClose = (key: 'liftgate' | 'falconDoors', o: OpenDanceCloseOptions, travelOpen: number) => (
    <>
      <Field label="Open">
        <Select value={o.openAt} onChange={(v) => set(key, { openAt: v })} options={OPEN_AT} />
        {o.openAt === 'custom' && <TimeInput value={o.openTime} max={duration} onChange={(v) => set(key, { openTime: v })} />}
      </Field>
      <Field label={`Dance (only possible ~${travelOpen} s after opening)`}>
        <Select
          value={o.dance}
          onChange={(v) => set(key, { dance: v })}
          options={[
            ['none', 'No dancing'],
            ['loudest', 'Once, at the loudest section'],
            ['everyHigh', 'At every loud section'],
            ['custom', 'At times I choose'],
          ]}
        />
        {o.dance === 'custom' && <TimesInput values={o.danceTimes} max={duration} getTime={getTime} onChange={(v) => set(key, { danceTimes: v })} />}
      </Field>
      {o.dance !== 'none' && <Range label="Each dance lasts" value={o.danceSeconds} min={3} max={30} unit="s" onChange={(v) => set(key, { danceSeconds: v })} />}
      <Field label="Close">
        <Select
          value={o.closeAt}
          onChange={(v) => set(key, { closeAt: v })}
          options={[
            ['end', 'Near the end of the song'],
            ['afterDance', 'Right after the last dance'],
            ['custom', 'At a time I choose'],
          ]}
        />
        {o.closeAt === 'custom' && <TimeInput value={o.closeTime} max={duration} onChange={(v) => set(key, { closeTime: v })} />}
      </Field>
    </>
  );

  const cp = closures.chargePort;
  const mi = closures.mirrors;
  const wi = closures.windows;
  const dh = closures.doorHandles;
  const fd = closures.frontDoors;

  return (
    <div className="panel">
      <h3>Moving parts</h3>
      {block(
        'chargePort',
        'Charge port',
        'Opens, flashes its LED in rainbow colours, closes. Harmless and fun.',
        avail.chargePort,
        'Not available on this vehicle.',
        <>
          <Field label="Open">
            <Select value={cp.openAt} onChange={(v) => set('chargePort', { openAt: v })} options={OPEN_AT} />
            {cp.openAt === 'custom' && <TimeInput value={cp.openTime} max={duration} onChange={(v) => set('chargePort', { openTime: v })} />}
          </Field>
          <label className="check">
            <input type="checkbox" checked={cp.dance} onChange={(e) => set('chargePort', { dance: e.target.checked })} /> Rainbow LED while open
          </label>
          <Field label="Close">
            <Select value={cp.closeAt} onChange={(v) => set('chargePort', { closeAt: v })} options={[['end', 'Near the end of the song'], ['custom', 'At a time I choose']]} />
            {cp.closeAt === 'custom' && <TimeInput value={cp.closeTime} max={duration} onChange={(v) => set('chargePort', { closeTime: v })} />}
          </Field>
          <p className="hint">The door closes by itself two minutes after opening, so long songs close early.</p>
        </>,
      )}
      {block(
        'mirrors',
        'Mirrors',
        'Fold in, hold, unfold. Each fold + unfold uses 2 of the 20 allowed commands.',
        avail.mirrors,
        'Not available on this vehicle.',
        <>
          <Field label="Fold">
            <Select value={mi.trigger} onChange={(v) => set('mirrors', { trigger: v })} options={MOVE_TRIGGER} />
            {mi.trigger === 'custom' && <TimesInput values={mi.customTimes} max={duration} getTime={getTime} onChange={(v) => set('mirrors', { customTimes: v })} />}
          </Field>
          <Range label="Stay folded for" value={mi.holdSeconds} min={3} max={12} step={0.5} unit="s" onChange={(v) => set('mirrors', { holdSeconds: v })} />
          <Range label="Maximum moves" value={mi.maxMoves} min={1} max={10} unit="folds" onChange={(v) => set('mirrors', { maxMoves: v })} />
        </>,
      )}
      {block(
        'windows',
        'Windows',
        'Dance (oscillate) for a while, then close. Up to 3 episodes with closing, 6 without.',
        avail.windows,
        'Not available on this vehicle.',
        <>
          <Field label="Which windows">
            <Select value={wi.which} onChange={(v) => set('windows', { which: v })} options={[['all', 'All four'], ['front', 'Front only'], ['rear', 'Rear only']]} />
          </Field>
          <Field label="Dance">
            <Select
              value={wi.trigger}
              onChange={(v) => set('windows', { trigger: v })}
              options={[
                ['loudest', 'Once, at the loudest section'],
                ['everyHigh', 'At every loud section'],
                ['custom', 'At times I choose'],
              ]}
            />
            {wi.trigger === 'custom' && <TimesInput values={wi.customTimes} max={duration} getTime={getTime} onChange={(v) => set('windows', { customTimes: v })} />}
          </Field>
          <Range label="Each dance lasts" value={wi.danceSeconds} min={3} max={30} unit="s" onChange={(v) => set('windows', { danceSeconds: v })} />
          <label className="check">
            <input type="checkbox" checked={wi.closeAfter} onChange={(e) => set('windows', { closeAfter: e.target.checked })} /> Close afterwards (recommended)
          </label>
          <label className="check">
            <input type="checkbox" checked={wi.stagger} onChange={(e) => set('windows', { stagger: e.target.checked })} /> Start one after another for a wave
          </label>
        </>,
        'Music plays from the cabin, so it gets quieter once the windows close. Keep the total under ~30 s to avoid thermal cut-outs.',
      )}
      {block(
        'liftgate',
        avail.liftgateLabel,
        `Opens (about 14 s), can dance once fully open, closes (about 4 s).`,
        avail.liftgate,
        profile.config.model === 'model-3' ? 'Tick "Power liftgate fitted" under Your car to enable.' : 'Not available on this vehicle.',
        openDanceClose('liftgate', closures.liftgate, 14),
        `Needs clearance ${avail.liftgateLabel === 'Frunk' ? 'in front of' : 'behind'} the car.`,
      )}
      {avail.doorHandles &&
        block(
          'doorHandles',
          'Door handles',
          'Present the handles, hold, retract. Each move uses 2 of the 20 allowed commands.',
          true,
          '',
          <>
            <Field label="Present">
              <Select value={dh.trigger} onChange={(v) => set('doorHandles', { trigger: v })} options={MOVE_TRIGGER} />
              {dh.trigger === 'custom' && <TimesInput values={dh.customTimes} max={duration} getTime={getTime} onChange={(v) => set('doorHandles', { customTimes: v })} />}
            </Field>
            <Range label="Stay out for" value={dh.holdSeconds} min={3} max={12} step={0.5} unit="s" onChange={(v) => set('doorHandles', { holdSeconds: v })} />
          </>,
        )}
      {avail.falconDoors &&
        block(
          'falconDoors',
          'Falcon wing doors',
          'Open (about 20 s), dance once open, close (about 8 s).',
          true,
          '',
          openDanceClose('falconDoors', closures.falconDoors, 20),
          'Needs full overhead and side clearance. Do not run this in a garage. Avoid moving the windows at the same time (false pinch detection stops the show).',
        )}
      {avail.frontDoors &&
        block(
          'frontDoors',
          'Front doors',
          'Open (about 22 s) and close (about 3 s).',
          true,
          '',
          <>
            <Field label="Open">
              <Select value={fd.openAt} onChange={(v) => set('frontDoors', { openAt: v })} options={OPEN_AT} />
              {fd.openAt === 'custom' && <TimeInput value={fd.openTime} max={duration} onChange={(v) => set('frontDoors', { openTime: v })} />}
            </Field>
            <Field label="Close">
              <Select value={fd.closeAt} onChange={(v) => set('frontDoors', { closeAt: v })} options={[['end', 'Near the end of the song'], ['custom', 'At a time I choose']]} />
              {fd.closeAt === 'custom' && <TimeInput value={fd.closeTime} max={duration} onChange={(v) => set('frontDoors', { closeTime: v })} />}
            </Field>
          </>,
          'Needs side clearance. Do not run this next to walls or other cars.',
        )}
      {warnings.length > 0 && (
        <ul className="issues" style={{ marginTop: 10 }}>
          {warnings.map((w, i) => (
            <li className="warning" key={i}>
              <span>⚠️</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Custom cue times use the song timeline. Press <b>+ at playhead</b> while previewing to drop a cue where the music is. Command counts stay within Tesla's
        per-show limits automatically.
      </p>
    </div>
  );
}
