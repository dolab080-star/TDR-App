import { useMemo, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { ClosuresPanel } from './ClosuresPanel';
import { DEFAULT_CLOSURES, DEFAULT_SHOW_OPTIONS, type ShowOptions } from '../lib/show/types';
import { vehicleProfile } from '../lib/tesla/vehicles';
import { CLOSURE_LIMITS } from '../lib/tesla/channels';
import type { ValidationReport } from '../lib/tesla/validator';

/**
 * The tool's own Show style and Moving parts panels, live, so visitors can
 * see (and poke at) what they'll control. Every part starts unticked so all
 * four rows are visible at once; ticking one expands its real options.
 */
const START: ShowOptions = {
  ...DEFAULT_SHOW_OPTIONS,
  vehicle: { ...DEFAULT_SHOW_OPTIONS.vehicle, model: 'model-y', year: 2026, powerLiftgate: true },
  closures: {
    ...DEFAULT_CLOSURES,
    chargePort: { ...DEFAULT_CLOSURES.chargePort, enabled: false },
    mirrors: { ...DEFAULT_CLOSURES.mirrors, enabled: false },
  },
};

const USAGE: ValidationReport['closureUsage'] = (Object.keys(CLOSURE_LIMITS) as (keyof typeof CLOSURE_LIMITS)[]).map((group) => ({
  group,
  used: 0,
  limit: CLOSURE_LIMITS[group],
}));

export function OptionsPeek() {
  const [options, setOptions] = useState<ShowOptions>(START);
  const profile = useMemo(() => vehicleProfile(options.vehicle), [options.vehicle]);
  return (
    <aside className="hero-peek" aria-label="A peek at the controls you get">
      <SettingsPanel options={options} onChange={setOptions} />
      <ClosuresPanel
        closures={options.closures}
        onChange={(closures) => setOptions({ ...options, closures })}
        profile={profile}
        usage={USAGE}
        warnings={[]}
        getTime={() => 0}
        duration={240}
      />
      <p className="hint hero-peek-label">A peek at the controls — all of them are yours after checkout.</p>
    </aside>
  );
}
