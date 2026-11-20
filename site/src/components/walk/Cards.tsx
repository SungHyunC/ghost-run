import type { Candle, CheckRowView, Segment, Stamp } from '../../engine/types';
import { stepLabel } from '../../data/narration';
import { Icon } from '../art/Icon';

/** The ward card's name: the violated ward ids when there are any (the headline ward first), else the headline ward. */
export function wardName(headline: string, violated: readonly string[]): string {
  if (violated.length === 0) return headline;
  const rest = violated.filter((id) => id !== headline);
  return (violated.includes(headline) ? [headline, ...rest] : [...violated]).join(', ');
}

/** True for the effectsOutside texts that say nothing leaves the box (they get the check mark). */
const NOTHING_LEAVES = /^(nothing leaves|no --endpoint-url)/;

export interface WardCardProps {
  wardId: string;
  rows: CheckRowView[];
  scan: boolean;
  tone: 'none' | 'bad' | 'good';
  eoShown: boolean;
  effectsOutside: string;
  wardRef?: React.Ref<HTMLDivElement>;
}

export function WardCard({ wardId, rows, scan, tone, eoShown, effectsOutside, wardRef }: WardCardProps) {
  const cls = ['ward', scan ? 'scan' : '', tone === 'none' ? '' : tone].filter(Boolean).join(' ');
  return (
    <div className={cls} id="ward" ref={wardRef}>
      <Icon id="i-ward" viewBox="0 0 40 40" />
      <b className="wname" id="wname">
        {wardId}
      </b>
      <div className="checks" id="checks">
        {rows.map((r) => (
          <div className={r.ok ? 'chk ok' : 'chk bad'} key={r.label}>
            <span>{r.label}</span>
            <em>{`${r.measured} ${r.ok ? '\u2713' : '\u2717'}`}</em>
          </div>
        ))}
      </div>
      <div className={eoShown ? 'eo show' : 'eo'} id="eo">
        {NOTHING_LEAVES.test(effectsOutside) ? `${effectsOutside} \u2713` : `effectsOutside: ${effectsOutside}`}
      </div>
    </div>
  );
}

export interface VerdictCardProps {
  candle: Candle;
  stamp: Stamp;
  verdictRef?: React.Ref<HTMLDivElement>;
}

export function VerdictCard({ candle, stamp, verdictRef }: VerdictCardProps) {
  const stampClass =
    stamp === 'none' ? 'stamp' : stamp === 'BLOCKED' ? 'stamp block show' : stamp === 'PASS' ? 'stamp pass show' : 'stamp warn show';
  return (
    <div className="verdict" id="verdict" ref={verdictRef}>
      <svg className={candle === 'lit' ? 'bigcandle' : `bigcandle ${candle}`} id="vcandle" viewBox="0 0 40 70" aria-hidden="true">
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
      <span className={stampClass} id="stamp">
        {stamp === 'none' ? '' : stamp}
      </span>
    </div>
  );
}

/** The speech bar. The live region exists from the first render and is empty until Step 1 starts. */
export function SpeechBar({ narration, step }: { narration: Segment[]; step: number }) {
  return (
    <div className="say">
      <Icon id="boo" viewBox="0 0 120 130" />
      <p id="sayt" aria-live="polite">
        {step >= 0 && narration.length > 0 ? <small>{stepLabel(step)}</small> : null}
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
