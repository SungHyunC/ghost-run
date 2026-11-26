import { useId, useRef } from 'react';
import { escapeForDisplay as esc } from '@ghost-run/ui';
import type { GhostHandAction } from '@ghost-run/drawer-arm';
import { describeAction } from '@ghost-run/drawer-arm';
import type { FileError, PlanFile } from '../plan/plan-file';
import { PLAN_ORIGIN_RECORDED_TEXT, PLAN_ORIGIN_SCRIPTED_TEXT } from '../texts';
import {
  CLEAR_PLAN_LABEL,
  DOWNLOAD_PLAN_LABEL,
  LOAD_PLAN_LABEL,
  NO_PLAN_TEXT,
  PLAN_HEADING,
  PLAY_DEMO_LABEL,
  RUN_GHOST_LABEL,
  SCENARIOS_LABEL,
} from '../ui-text';
import { SeedInput } from './SeedInput';
import type { SeedInputProps } from './SeedInput';

export interface PlanPanelProps {
  readonly plan: PlanFile | null;
  readonly errors: readonly FileError[] | null;
  readonly seed: Omit<SeedInputProps, 'disabled'>;
  readonly canRun: boolean;
  readonly busy: boolean;
  readonly onLoadText: (text: string) => void;
  readonly onDownload: () => void;
  readonly onRun: () => void;
  readonly onClear: () => void;
  readonly scenarios: readonly { readonly id: string; readonly label: string }[];
  readonly onLoadScenario: (id: string) => void;
  readonly onPlayDemo: () => void;
  readonly canPlayDemo: boolean;
  readonly demoActive: boolean;
  /** Current demo step text; null when no demo ran. */
  readonly demoStatus: string | null;
  /**
   * `all` (default): the whole panel. `details`: the plan, the file controls, Download, and Clear only;
   * the page then shows the scenarios, Play demo, Run ghost, and the seed in its rail.
   */
  readonly part?: 'all' | 'details';
}

function actionLabel(a: GhostHandAction, index: number): string {
  return `${index + 1}. ${describeAction(a)}`;
}

/** Plan summary, load, download, run, clear, and the seed. Every string from a Plan_File is escaped. */
export function PlanPanel(props: PlanPanelProps) {
  const { plan, errors, canRun, busy } = props;
  const all = props.part !== 'details';
  const headingId = useId();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className={all ? 'gk-section' : 'gk-section gh-plan'} aria-labelledby={headingId}>
      <h2 className="gk-heading" id={headingId}>
        {PLAN_HEADING}
      </h2>
      {plan === null ? (
        <p className="gk-empty">{NO_PLAN_TEXT}</p>
      ) : (
        <div>
          <p className="gh-mono">{esc(plan.name)}</p>
          <p>{plan.origin === 'recorded' ? PLAN_ORIGIN_RECORDED_TEXT : PLAN_ORIGIN_SCRIPTED_TEXT}</p>
          {plan.note !== undefined ? <p>{esc(plan.note)}</p> : null}
          <ol className="gh-steps gh-mono" aria-label="Plan actions">
            {plan.actions.map((a, i) => (
              <li key={i}>{esc(actionLabel(a, i))}</li>
            ))}
          </ol>
        </div>
      )}
      {errors !== null && errors.length > 0 ? (
        <ul role="alert" className="gh-errors gh-mono">
          {errors.map((e, i) => (
            <li key={i}>
              <span aria-hidden="true">{'\u2715 '}</span>
              {esc(`${e.field}: [${e.code}] ${e.message}`)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="gh-field">
        <label htmlFor={fileId}>{LOAD_PLAN_LABEL}</label>
        <input
          id={fileId}
          ref={fileRef}
          className="gk-input"
          type="file"
          disabled={busy}
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file === undefined) return;
            // Read in the browser; the file is never uploaded.
            void file.text().then((text) => {
              props.onLoadText(text);
            });
            e.target.value = '';
          }}
        />
      </div>
      {all ? <SeedInput {...props.seed} disabled={busy} /> : null}
      {all ? (
      <div className="gh-actions" role="group" aria-label={SCENARIOS_LABEL}>
        {props.scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            className="gk-button"
            disabled={busy || props.demoActive}
            onClick={() => {
              props.onLoadScenario(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="gk-button"
          disabled={!props.canPlayDemo || busy || props.demoActive}
          onClick={props.onPlayDemo}
        >
          {PLAY_DEMO_LABEL}
        </button>
      </div>
      ) : null}
      {all && props.demoStatus !== null ? <p role="status">{props.demoStatus}</p> : null}
      <div className="gh-actions">
        {all ? (
          <button type="button" className="gk-button" disabled={!canRun || busy} onClick={props.onRun}>
            {RUN_GHOST_LABEL}
          </button>
        ) : null}
        <button type="button" className="gk-button" disabled={plan === null} onClick={props.onDownload}>
          {DOWNLOAD_PLAN_LABEL}
        </button>
        <button type="button" className="gk-button" disabled={plan === null || busy} onClick={props.onClear}>
          {CLEAR_PLAN_LABEL}
        </button>
      </div>
    </section>
  );
}
