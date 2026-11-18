import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useConsumePendingFocus, useFocusReturn } from '../hooks/useFocusReturn';
import { buildGraveyardModel } from '../model/graveyard';
import type { GraveyardModel, TombstoneModel } from '../model/graveyard';
import { NO_SEANCE_LINK, TIME_UNREADABLE } from '../model/texts';
import type { GraveyardProps } from '../types';
import { TombstoneShape } from './art/TombstoneShape';
import { KitBoundary } from './KitBoundary';
import { Placeholder } from './Placeholder';
import { Reveal } from './Reveal';

export interface GraveyardViewProps {
  readonly model: GraveyardModel;
  readonly revealAll: boolean;
  readonly onOpen?: (tombstone: TombstoneModel) => void;
  readonly onReveal?: () => void;
}

function Tombstone({ t, onOpen }: { t: TombstoneModel; onOpen?: (t: TombstoneModel) => void }): ReactNode {
  if (t.unreadable) {
    return <li className="gk-note">{t.accessibleName}</li>;
  }
  const disabled = !t.rawIdValid;
  return (
    <li>
      <button
        type="button"
        className="gk-tombstone"
        data-tombstone-index={t.inputIndex}
        data-tombstone-id={t.id}
        aria-label={t.accessibleName}
        disabled={disabled}
        onClick={disabled || onOpen === undefined ? undefined : () => onOpen(t)}
      >
        <TombstoneShape />
        <code className="gk-mono gk-tombstone-command">{t.command}</code>
        <span className="gk-mono">{t.recordedAt}</span>
        {t.timeUnreadable ? <span className="gk-note">{TIME_UNREADABLE}</span> : null}
        <span className="gk-mono">{t.wardIds.join(', ')}</span>
        {disabled ? <span className="gk-note">{NO_SEANCE_LINK}</span> : null}
      </button>
    </li>
  );
}

/** Pure view of a Graveyard model. */
export function GraveyardView(props: GraveyardViewProps) {
  const { model, revealAll, onOpen, onReveal } = props;
  const headingId = `${useId()}-h`;
  const shown = revealAll ? model.totalTombstones : model.shownTombstones;
  return (
    <section className="gk-section" aria-labelledby={headingId}>
      <h2 className="gk-heading" id={headingId}>
        Graveyard
      </h2>
      <p className="gk-summary">
        <span className="gk-mono">{model.summary}</span>
      </p>
      {model.emptyText !== null ? <p className="gk-empty">{model.emptyText}</p> : null}
      <ul className="gk-tombstones">
        {model.tombstones.slice(0, shown).map((t) => (
          <Tombstone key={t.inputIndex} t={t} {...(onOpen ? { onOpen } : {})} />
        ))}
      </ul>
      {!revealAll && model.shownTombstones < model.totalTombstones ? (
        <Reveal
          shown={model.shownTombstones}
          total={model.totalTombstones}
          noun="tombstones"
          {...(onReveal ? { onReveal } : {})}
        />
      ) : null}
    </section>
  );
}

function GraveyardInner(props: GraveyardProps) {
  const [revealAll, setRevealAll] = useState(false);
  const store = useFocusReturn();
  useConsumePendingFocus();
  const model = buildGraveyardModel(props.entries);
  if (model.kind === 'unreadable') return <Placeholder name="Graveyard" />;
  const open = (t: TombstoneModel): void => {
    const cb: unknown = props.onOpenSeance;
    if (typeof cb !== 'function') return;
    const entry: unknown = (props.entries as readonly unknown[])[t.inputIndex];
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return;
    store.remember(t.inputIndex);
    (cb as (id: string) => void)(id);
  };
  return <GraveyardView model={model} revealAll={revealAll} onOpen={open} onReveal={() => setRevealAll(true)} />;
}

/** Container: state, focus return, boundary, Placeholder path. */
export function Graveyard(props: GraveyardProps) {
  return (
    <KitBoundary name="Graveyard">
      <GraveyardInner {...props} />
    </KitBoundary>
  );
}
