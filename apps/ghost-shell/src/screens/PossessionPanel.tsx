import { useMemo } from 'react';
import { scanText } from '@ghost-run/core';
import type { PageAction, PageState } from '../state/reducer';
import { CANARY_TEXT, POSSESSION_ACTION_TEXT, PURIFY_LABEL, PURIFY_NOTE_TEXT } from '../texts';
import { BlacklightView, RedThreadView, escapeForDisplay } from '../ui-imports';
import type { BlacklightSource } from '../ui-imports';

export interface PossessionPanelProps {
  readonly state: PageState;
  readonly dispatch: (action: PageAction) => PageState | void;
}

/** The texts the page reads: the provenance of the plan, or the README of the fixture copy. */
function sourcesOf(provenance: PageState['provenance'], readme: string): readonly BlacklightSource[] {
  if (provenance !== undefined && provenance.length > 0) {
    return provenance.map((r) => ({ source: r.source, text: r.content, scan: scanText(r.content) }));
  }
  return [{ source: 'README.md', text: readme, scan: scanText(readme) }];
}

export function PossessionPanel({ state, dispatch }: PossessionPanelProps) {
  const { provenance, readme, plan, run } = state;
  // The sources depend on the provenance and the README only.
  const sources = useMemo(() => sourcesOf(provenance, readme), [provenance, readme]);
  const actionLabels = useMemo(() => plan.map((a) => escapeForDisplay(a.command)), [plan]);
  return (
    <section className="gk-section" aria-labelledby="gs-possession-h">
      <h2 id="gs-possession-h" className="gk-heading">Possession</h2>
      <RedThreadView needles={run?.needles ?? []} links={run?.links ?? []} actionLabels={actionLabels} />
      <BlacklightView sources={sources} />
      <div className="gs-actions">
        <button
          type="button"
          className="gk-button"
          onClick={() => {
            dispatch({ type: 'purify' });
          }}
        >
          {PURIFY_LABEL}
        </button>
      </div>
      <p>{PURIFY_NOTE_TEXT}</p>
      <p>{POSSESSION_ACTION_TEXT}</p>
      <p>{CANARY_TEXT}</p>
    </section>
  );
}
