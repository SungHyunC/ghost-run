import type { CheckRowView, Segment, Stamp } from '../../engine/types';
import { Icon } from '../art/Icon';

export function PlanBar({ text, rev }: { text: string; rev: boolean }) {
  return (
    <div className={rev ? 'plan rev' : 'plan'} id="plan">
      <span className="plan-h">🤖 Agent's plan</span>
      <pre id="plancode">{text}</pre>
      <span className="rev-tag">fixed by the agent</span>
    </div>
  );
}

export interface WardCardProps {
  wardId: string;
  kindLine: string;
  rows: CheckRowView[];
  scan: boolean;
  tone: 'none' | 'bad' | 'good';
  eoShown: boolean;
  effectsOutside: string;
  wardRef?: React.Ref<HTMLDivElement>;
}

export function WardCard({ wardId, kindLine, rows, scan, tone, eoShown, effectsOutside, wardRef }: WardCardProps) {
  const cls = ['ward', scan ? 'scan' : '', tone === 'none' ? '' : tone].filter(Boolean).join(' ');
  return (
    <div className={cls} id="ward" ref={wardRef}>
      <Icon id="i-ward" viewBox="0 0 40 40" />
      <div>
        <span className="wname" id="wname">
          {wardId}
        </span>{' '}
        <span className="wkind" id="wkind">
          {kindLine}
        </span>
      </div>
      <div className="checks" id="checks">
        {rows.map((r) => (
          <div className={r.ok ? 'chk ok' : 'chk bad'} key={r.label}>
            <span>{r.label}</span>
            <em>{`${r.measured} ${r.ok ? '\u2713' : '\u2717'}`}</em>
          </div>
        ))}
      </div>
      <div className={eoShown ? 'eo show' : 'eo'} id="eo">
        {`effectsOutside: ${effectsOutside} \u2713`}
      </div>
    </div>
  );
}

export interface VerdictCardProps {
  candleOut: boolean;
  stamp: Stamp;
  note: string;
  verdictRef?: React.Ref<HTMLDivElement>;
}

export function VerdictCard({ candleOut, stamp, note, verdictRef }: VerdictCardProps) {
  const stampClass = stamp === 'none' ? 'stamp' : stamp === 'BLOCKED' ? 'stamp block show' : 'stamp pass show';
  return (
    <div className="verdict" id="verdict" ref={verdictRef}>
      <svg className={candleOut ? 'bigcandle out' : 'bigcandle'} id="vcandle" viewBox="0 0 40 70" aria-hidden="true">
        <rect x="11" y="26" width="18" height="40" rx="4" fill="#fff1d6" />
        <line x1="20" y1="26" x2="20" y2="21" stroke="#3a3326" strokeWidth="2" />
        <path className="flame" d="M20 4q8 8 0 17q-8-9 0-17z" fill="#ffb347" />
        <path
          className="smoke"
          d="M20 19c-4-4 4-6 0-10c-3-3 2-5 0-8"
          stroke="#a7a3bd"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="42" r="1.7" fill="#2a1b3d" />
        <circle cx="23.5" cy="42" r="1.7" fill="#2a1b3d" />
        <path d="M17.5 46.5q2.5 2 5 0" stroke="#2a1b3d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <div className="vtxt">
        <span className={stampClass} id="stamp">
          {stamp === 'none' ? '' : stamp}
        </span>
        <span className="vnote" id="vnote">
          {note}
        </span>
      </div>
    </div>
  );
}

/** The speech bar. The live region exists from the first render and is empty until Step 1 starts. */
export function SpeechBar({ narration }: { narration: Segment[] }) {
  return (
    <div className="say">
      <Icon id="boo" viewBox="0 0 120 130" />
      <p id="sayt" aria-live="polite">
        {narration.map((s, i) => {
          const key = `${String(i)}-${s.kind}`;
          if (s.kind === 'b') return <b key={key}>{s.text}</b>;
          if (s.kind === 'code') return <code key={key}>{s.text}</code>;
          return <span key={key}>{s.text}</span>;
        })}
      </p>
    </div>
  );
}
