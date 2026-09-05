import type { AnalysisResult } from '../lib/audio/analyze';
import type { ValidationReport } from '../lib/tesla/validator';
import { formatDuration } from '../lib/tesla/validator';

interface Props {
  analysis: AnalysisResult;
  report: ValidationReport;
  fseqBytes: number;
}

const GROUP_LABEL: Record<string, string> = {
  liftgate: 'Liftgate',
  mirrors: 'Mirrors',
  chargePort: 'Charge port',
  windows: 'Windows',
  doorHandles: 'Door handles',
  frontDoors: 'Front doors',
  falconDoors: 'Falcon doors',
};

export function StatsPanel({ analysis, report, fseqBytes }: Props) {
  const used = report.closureUsage.filter((u) => u.used > 0);
  return (
    <div className="panel">
      <h3>Analysis &amp; validation</h3>
      <div className="stats">
        <div className="stat">
          <div className="k">Tempo</div>
          <div className="v">{analysis.bpm.toFixed(1)} BPM</div>
        </div>
        <div className="stat">
          <div className="k">Bars</div>
          <div className="v">{analysis.bars.length}</div>
        </div>
        <div className="stat">
          <div className="k">Sections</div>
          <div className="v">{analysis.sections.length}</div>
        </div>
        <div className="stat">
          <div className="k">Frames</div>
          <div className="v">{report.frameCount.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="k">Step</div>
          <div className="v">{report.stepTimeMs} ms</div>
        </div>
        <div className="stat">
          <div className="k">Light changes</div>
          <div className="v">{report.lightChanges.toLocaleString()}</div>
        </div>
      </div>
      <ul className="issues">
        <li className={report.ok ? 'ok' : 'error'}>
          <span>{report.ok ? '✅' : '⛔'}</span>
          <span>
            {report.ok ? 'Passes Tesla’s validator checks' : 'Fails Tesla’s validator checks'} — FSEQ v2.0 uncompressed, {report.channelCount} channels,{' '}
            {formatDuration(report.durationS)}, {(fseqBytes / 1024).toFixed(0)} KB
          </span>
        </li>
        {report.issues.map((i, k) => (
          <li className={i.level} key={k}>
            <span>{i.level === 'error' ? '⛔' : i.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>{i.message}</span>
          </li>
        ))}
      </ul>
      {used.length > 0 && (
        <table className="usage">
          <tbody>
            {used.map((u) => (
              <tr key={u.group}>
                <td>{GROUP_LABEL[u.group]} commands</td>
                <td>
                  {u.used} / {u.limit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
