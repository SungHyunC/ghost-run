import { useEffect, useRef } from 'react';
import type { Ref } from 'react';
import { useFocusReturn } from '../hooks/useFocusReturn';
import { buildSeanceModel } from '../model/seance';
import type { SeanceModel } from '../model/seance';
import { BACK_TO_GRAVEYARD, SEANCE_TITLE } from '../model/texts';
import type { GraveDetail, SeanceViewProps } from '../types';
import { BlacklightView } from './BlacklightView';
import { Candle } from './Candle';
import { KitBoundary } from './KitBoundary';
import { MirrorWorld } from './MirrorWorld';
import { Placeholder } from './Placeholder';
import { RedThreadView } from './RedThreadView';

const TITLE_ID = 'seance-title';

export interface SeanceMarkupProps {
  readonly model: SeanceModel;
  /** The recorded detail as supplied; read only for the parts the model reports as present. */
  readonly detail: unknown;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly onBack?: () => void;
}

/** Pure markup of a seance for a built model. */
export function SeanceMarkup({ model, detail, headingRef, onBack }: SeanceMarkupProps) {
  // Each child validates its own input and shows a Placeholder when unreadable.
  const d = (typeof detail === 'object' && detail !== null ? detail : {}) as Partial<Record<keyof GraveDetail, never>>;
  return (
    <section className="gk-section gk-seance" aria-labelledby={TITLE_ID}>
      <div className="gk-header">
        <h2 className="gk-heading" id={TITLE_ID} tabIndex={-1} ref={headingRef}>
          {SEANCE_TITLE}
        </h2>
        <button type="button" className="gk-button" onClick={onBack}>
          {BACK_TO_GRAVEYARD}
        </button>
      </div>
      <p>
        <code className="gk-mono gk-seance-command">{model.command}</code>
      </p>
      <p className="gk-mono">{model.recordedAt}</p>
      <p className="gk-mono">{model.wardIds.join(', ')}</p>
      {model.parts.verdict ? <Candle verdict={d.wardVerdict} claims={d.claims} /> : null}
      {model.parts.changes ? <MirrorWorld changes={d.changes as never} /> : null}
      {model.parts.sources ? <BlacklightView sources={d.sources as never} /> : null}
      {model.parts.thread ? (
        <RedThreadView
          needles={d.needles as never}
          links={d.links as never}
          {...(d.actionLabels === undefined ? {} : { actionLabels: d.actionLabels })}
        />
      ) : null}
      {model.notRecorded.length > 0 ? (
        <ul className="gk-list gk-note">
          {model.notRecorded.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SeanceInner({ entry, onBack }: SeanceViewProps) {
  const store = useFocusReturn();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    return () => store.restore();
  }, [store]);
  const model = buildSeanceModel(entry);
  if (model.kind === 'unreadable') return <Placeholder name="SeanceView" />;
  const back = (): void => {
    const cb: unknown = onBack;
    if (typeof cb !== 'function') return;
    (cb as () => void)();
    store.restore();
  };
  return <SeanceMarkup model={model} detail={(entry as { detail?: unknown }).detail} headingRef={heading} onBack={back} />;
}

/** Container: focus on mount, focus return, boundary, Placeholder path. */
export function SeanceView(props: SeanceViewProps) {
  return (
    <KitBoundary name="SeanceView">
      <SeanceInner {...props} />
    </KitBoundary>
  );
}
