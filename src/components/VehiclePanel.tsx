import { GROUP_CHANNELS, MODELS, defaultHeadlights, vehicleProfile, yearsFor, type LightGroupKey, type VehicleConfig, type VehicleModel } from '../lib/tesla/vehicles';

interface Props {
  vehicle: VehicleConfig;
  onChange: (v: VehicleConfig) => void;
}

const ORDER: LightGroupKey[] = [
  'outerBeam',
  'innerBeam',
  'signature',
  'channels456',
  'frontTurn',
  'frontFog',
  'auxPark',
  'sideMarker',
  'sideRepeater',
  'rearTurn',
  'brake',
  'tail',
  'reverse',
  'rearFog',
  'plate',
];

export function VehiclePanel({ vehicle, onChange }: Props) {
  const profile = vehicleProfile(vehicle);
  const setModel = (model: VehicleModel) => {
    const year = yearsFor(model)[0];
    onChange({ ...vehicle, model, year, headlights: defaultHeadlights(model, year), powerLiftgate: true, standardRange: false });
  };
  const setYear = (year: number) => onChange({ ...vehicle, year, headlights: defaultHeadlights(vehicle.model, year) });
  const isCT = vehicle.model === 'cybertruck';
  const is3 = vehicle.model === 'model-3';

  return (
    <div className="panel">
      <h3>Your car</h3>
      <div className="grid2">
        <div className="field">
          <label>
            <span>Model</span>
          </label>
          <select className="select" value={vehicle.model} onChange={(e) => setModel(e.target.value as VehicleModel)} aria-label="Model">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            <span>Model year</span>
          </label>
          <select className="select" value={vehicle.year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Model year">
            {yearsFor(vehicle.model).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {!isCT && (
          <div className="field">
            <label>
              <span>Headlights</span>
            </label>
            <select
              className="select"
              value={vehicle.headlights}
              onChange={(e) => onChange({ ...vehicle, headlights: e.target.value as VehicleConfig['headlights'] })}
              aria-label="Headlight type"
            >
              <option value="projector">LED projector / matrix (lenses)</option>
              <option value="reflector">LED reflector (open reflector bowls)</option>
            </select>
          </div>
        )}
        <div className="field">
          <label>
            <span>Market</span>
          </label>
          <select className="select" value={vehicle.region} onChange={(e) => onChange({ ...vehicle, region: e.target.value as VehicleConfig['region'] })} aria-label="Market">
            <option value="na">North America</option>
            <option value="row">Europe / Asia / other</option>
          </select>
        </div>
      </div>
      {is3 && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={vehicle.standardRange} onChange={(e) => onChange({ ...vehicle, standardRange: e.target.checked })} />
            <span>
              <span className="t">Standard Range (+)</span>
              <br />
              <span className="d">No front fog lights or aux park lights fitted.</span>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={vehicle.powerLiftgate} onChange={(e) => onChange({ ...vehicle, powerLiftgate: e.target.checked })} />
            <span>
              <span className="t">Power liftgate fitted</span>
              <br />
              <span className="d">Needed for the liftgate to take part in the show.</span>
            </span>
          </label>
        </>
      )}
      {!isCT && <p className="hint">Headlight type is a best guess for the year. Reflector lamps ramp the outer beams; projector lamps switch them on and off.</p>}
      <details className="caps">
        <summary>What this car can do ({profile.label})</summary>
        <ul>
          {ORDER.map((k) => {
            const cap = profile.lights[k];
            return (
              <li key={k} className={cap.present ? '' : 'absent'}>
                <span>{cap.label}</span>
                <span className="val">
                  {cap.present ? (cap.ramping ? 'ramps' : 'on/off') : 'not fitted'}
                  {cap.note ? ` · ${cap.note}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
        {profile.ored.length > 0 && (
          <p className="hint">
            Shared outputs: {profile.ored.map((o) => o.label).join('; ')}. The show keeps shared off-time on these so they still flash.
          </p>
        )}
        {profile.notes.map((n, i) => (
          <p className="hint" key={i}>
            {n}
          </p>
        ))}
        <p className="hint">
          Channels used: {ORDER.filter((k) => profile.lights[k].present).reduce((n, k) => n + GROUP_CHANNELS[k].length, 0)} of 30 light channels. The .fseq file
          itself works on every supported Tesla.
        </p>
      </details>
    </div>
  );
}
