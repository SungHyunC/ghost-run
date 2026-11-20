// The ghost lineup: one ghost per run row (base first), drawn from the variant rows of the last run.
// It is a picture for sighted readers. The variant table below it is the accessible record, so this
// block is aria-hidden. It draws only what the rows say; it computes no verdict and no failure.
import { BASE_VARIANT_PARAMS } from '@ghost-run/drawer-arm';
import type { VariantParams } from '@ghost-run/drawer-arm';
import { escapeForDisplay as esc } from '@ghost-run/ui';
import { fixed } from '../format';
import type { VariantRow } from '../pipeline/types';
import {
  LINEUP_BASE_NAME,
  LINEUP_DRAWER,
  LINEUP_FAIL_TAG,
  LINEUP_FORCE,
  LINEUP_NO_HAUNTING,
  LINEUP_PASS_TAG,
  LINEUP_TITLE,
  LINEUP_VASE_TOUCHED,
  lineupGhostName,
} from '../ui-text';
import { GHOST_BODY_PATH } from './GhostMark';

export interface GhostLineupProps {
  readonly rows: readonly VariantRow[];
  /** Drawer displacement that counts as open (meters). */
  readonly targetOpeningM: number;
  /** Smallest max_contact_force_n of the physics wards, or null when no ward sets one. */
  readonly forceLimitN: number | null;
}

/** Share of the meter at which the threshold tick sits: the meter runs to 125 % of the threshold. */
const TICK_SHARE = 0.8;

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

interface Haunt {
  readonly text: string;
  readonly score: number;
}

/** The parameters of a variant that differ from the base world, strongest first. */
export function hauntsOf(p: VariantParams, base: VariantParams = BASE_VARIANT_PARAMS): readonly Haunt[] {
  const out: Haunt[] = [];
  const ratio = (a: number, b: number): number => (b === 0 ? 1 : a / b);
  const friction = ratio(p.drawerFrictionN, base.drawerFrictionN);
  if (Math.abs(friction - 1) >= 0.05) out.push({ text: `friction x${fixed(friction, 2)}`, score: Math.abs(Math.log(friction)) });
  const mass = ratio(p.drawerMassKg, base.drawerMassKg);
  if (Math.abs(mass - 1) >= 0.05) out.push({ text: `mass x${fixed(mass, 2)}`, score: Math.abs(Math.log(mass)) });
  const delay = p.commandDelaySteps - base.commandDelaySteps;
  if (delay !== 0) out.push({ text: `delay ${delay} steps`, score: Math.abs(delay) / 6 });
  const noiseMm = (p.sensorNoiseM - base.sensorNoiseM) * 1000;
  if (Math.abs(noiseMm) >= 0.1) out.push({ text: `noise ${fixed(noiseMm, 1)} mm`, score: Math.abs(noiseMm) / 3 });
  const offsetMm =
    Math.hypot(
      p.handleOffsetM[0] - base.handleOffsetM[0],
      p.handleOffsetM[1] - base.handleOffsetM[1],
      p.handleOffsetM[2] - base.handleOffsetM[2],
    ) * 1000;
  if (offsetMm >= 0.5) out.push({ text: `handle ${fixed(offsetMm, 1)} mm`, score: offsetMm / 10 });
  return out.sort((a, b) => b.score - a.score);
}

function Meter({ share, tick, over }: { readonly share: number; readonly tick: boolean; readonly over: boolean }) {
  const width = clamp01(share) * 100;
  return (
    <svg className="gh-meter-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x={0} y={2} width={100} height={6} rx={3} className="gh-meter-track" />
      <rect x={0} y={2} width={width} height={6} rx={3} className={over ? 'gh-meter-fill gh-meter-over' : 'gh-meter-fill'} />
      {tick ? <line x1={TICK_SHARE * 100} y1={0} x2={TICK_SHARE * 100} y2={10} className="gh-meter-tick" /> : null}
    </svg>
  );
}

function GhostFigure({ failed }: { readonly failed: boolean }) {
  return (
    <svg className="gh-ghost-svg" viewBox="-30 -38 60 72" aria-hidden="true" focusable="false">
      <path className="gh-ghost-body" d={GHOST_BODY_PATH} />
      {failed ? (
        <>
          <path d="M-12 -12 L-4 -4 M-4 -12 L-12 -4" className="gh-ghost-x" />
          <path d="M4 -12 L12 -4 M12 -12 L4 -4" className="gh-ghost-x" />
          <path d="M-5 8 Q0 4 5 8" className="gh-ghost-x" />
        </>
      ) : (
        <>
          <ellipse cx={-8} cy={-8} rx={3.6} ry={5.2} className="gh-ghost-eye" />
          <ellipse cx={8} cy={-8} rx={3.6} ry={5.2} className="gh-ghost-eye" />
          <ellipse cx={0} cy={5} rx={3} ry={3.4} className="gh-ghost-eye" />
        </>
      )}
    </svg>
  );
}

export function GhostLineup({ rows, targetOpeningM, forceLimitN }: GhostLineupProps) {
  if (rows.length === 0) return null;
  const maxForce = Math.max(1, ...rows.map((r) => r.maxContactForceN));
  const forceScale = forceLimitN !== null && forceLimitN > 0 ? forceLimitN / TICK_SHARE : maxForce;
  const drawerScale = targetOpeningM > 0 ? targetOpeningM / TICK_SHARE : 1;
  return (
    <div className="gh-lineup" aria-hidden="true">
      <p className="gh-lineup-title">{LINEUP_TITLE}</p>
      <ol className="gh-lineup-list">
        {rows.map((row, i) => {
          const failed = row.status === 'failed';
          const isBase = row.id === 'base';
          const overForce = forceLimitN !== null && row.maxContactForceN > forceLimitN;
          const shortDrawer = targetOpeningM > 0 && row.drawerDisplacementM < targetOpeningM;
          const haunts = isBase ? [] : hauntsOf(row.params).slice(0, 2);
          return (
            <li key={row.id} className="gh-ghost-card" data-status={row.status} data-base={isBase}>
              <div className="gh-ghost-top">
                <GhostFigure failed={failed} />
                <div className="gh-ghost-id">
                  <span className="gh-ghost-name">{isBase ? LINEUP_BASE_NAME : lineupGhostName(i)}</span>
                  <span className="gh-ghost-row gh-mono">{esc(row.id)}</span>
                </div>
                <span className="gh-ghost-tag">{failed ? LINEUP_FAIL_TAG : LINEUP_PASS_TAG}</span>
              </div>
              <div className="gh-meter" data-kind="drawer" data-short={shortDrawer}>
                <span className="gh-meter-label">{LINEUP_DRAWER}</span>
                <Meter share={row.drawerDisplacementM / drawerScale} tick={targetOpeningM > 0} over={shortDrawer} />
                <span className="gh-meter-value gh-mono">{`${fixed(row.drawerDisplacementM, 3)} m`}</span>
              </div>
              <div className="gh-meter" data-kind="force" data-over={overForce}>
                <span className="gh-meter-label">{LINEUP_FORCE}</span>
                <Meter share={row.maxContactForceN / forceScale} tick={forceLimitN !== null} over={overForce} />
                <span className="gh-meter-value gh-mono">{`${fixed(row.maxContactForceN, 1)} N`}</span>
              </div>
              <ul className="gh-haunts">
                {row.vaseTouched ? <li className="gh-flag">{LINEUP_VASE_TOUCHED}</li> : null}
                {row.jointLimitExceeded ? <li className="gh-flag">joint limit</li> : null}
                {row.selfCollisionOccurred ? <li className="gh-flag">self collision</li> : null}
                {isBase ? <li className="gh-haunt">{LINEUP_NO_HAUNTING}</li> : null}
                {haunts.map((h) => (
                  <li key={h.text} className="gh-haunt">
                    {h.text}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
