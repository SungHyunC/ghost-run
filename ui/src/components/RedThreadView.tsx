import { useCallback, useState } from 'react';
import { buildRedThreadModel } from '../model/thread';
import type { RedThreadModel, ThreadModel } from '../model/thread';
import { HIDDEN_TEXT, MATCHED_HOST_KEY, TURN_ON_BLACKLIGHT } from '../model/texts';
import type { RedThreadViewProps } from '../types';
import { Icon } from './art/Icon';
import { ThreadConnector } from './art/ThreadConnector';
import { KitBoundary } from './KitBoundary';
import { Placeholder } from './Placeholder';
import { Reveal } from './Reveal';

function ThreadItem({ thread }: { readonly thread: ThreadModel }) {
  const { action, cause } = thread;
  return (
    <li className="gk-thread" data-thread-index={thread.index}>
      <div role="group" aria-label={thread.accessibleName} className="gk-thread-body">
      {action === null ? (
        <div className="gk-thread-end">{thread.accessibleName}</div>
      ) : (
        <div className="gk-thread-end" data-end="action">
          <div className="gk-mono">{action.stepText}</div>
          {action.actionLabel === undefined ? null : <div>{action.actionLabel}</div>}
          <div>{action.origin}</div>
          <div className="gk-mono">{action.value}</div>
        </div>
      )}
      {cause === null ? <span /> : <ThreadConnector />}
      {cause !== null ? (
        <div className="gk-thread-end" data-end="cause">
          <div>{`${cause.source} (${cause.kind})`}</div>
          <div className="gk-mono">{cause.position}</div>
          <div className="gk-mono">{cause.lineText}</div>
          {cause.matchedHost ? <div>{MATCHED_HOST_KEY}</div> : null}
          {cause.hidden ? (
            <div className="gk-note">
              <Icon id="hidden-text" />
              <span>{`${HIDDEN_TEXT}. ${TURN_ON_BLACKLIGHT}`}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="gk-thread-end" data-end="none">
          {thread.notFoundText}
        </div>
      )}
      </div>
    </li>
  );
}

export interface RedThreadPanelViewProps {
  readonly model: RedThreadModel;
  readonly revealAll: boolean;
  readonly onRevealAll?: () => void;
}

/** Pure markup for a built model. */
export function RedThreadPanelView({ model, revealAll, onRevealAll }: RedThreadPanelViewProps) {
  const shown = revealAll ? model.totalThreads : model.shownThreads;
  return (
    <section className="gk-section" aria-label="Red thread">
      <h2 className="gk-heading">Red thread</h2>
      {model.emptyText === null ? null : <p className="gk-empty">{model.emptyText}</p>}
      {model.mismatch === null ? null : <p className="gk-note">{model.mismatch}</p>}
      <ul className="gk-list">
        {model.threads.slice(0, shown).map((t) => (
          <ThreadItem key={t.index} thread={t} />
        ))}
      </ul>
      {shown < model.totalThreads ? (
        <Reveal shown={shown} total={model.totalThreads} noun="threads" onReveal={onRevealAll} />
      ) : null}
      <p className="gk-note">{model.literalOnlyText}</p>
    </section>
  );
}

export interface RedThreadMarkupProps extends RedThreadViewProps {
  readonly revealAll?: boolean;
  readonly onRevealAll?: () => void;
}

/** Pure markup of the whole part for a given interaction state. */
export function RedThreadViewMarkup({ needles, links, actionLabels, revealAll = false, onRevealAll }: RedThreadMarkupProps) {
  const model = buildRedThreadModel({ needles, links, actionLabels });
  if (model.kind === 'unreadable') return <Placeholder name="RedThreadView" />;
  return <RedThreadPanelView model={model} revealAll={revealAll} onRevealAll={onRevealAll} />;
}

function RedThreadContainer(props: RedThreadViewProps) {
  const [revealAll, setRevealAll] = useState(false);
  const onRevealAll = useCallback(() => setRevealAll(true), []);
  return <RedThreadViewMarkup {...props} revealAll={revealAll} onRevealAll={onRevealAll} />;
}

/** The red thread part: action end, cause end, and a line between them for found causes. */
export function RedThreadView(props: RedThreadViewProps) {
  return (
    <KitBoundary name="RedThreadView">
      <RedThreadContainer {...props} />
    </KitBoundary>
  );
}
