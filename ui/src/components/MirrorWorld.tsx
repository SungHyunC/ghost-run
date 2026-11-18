import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { WOULD_BE_REMOVED, buildMirrorModel } from '../model/mirror';
import type { ChangeRowModel, MirrorModel, PaneCell } from '../model/mirror';
import { unreadableItem } from '../model/texts';
import type { MirrorWorldProps } from '../types';
import { Icon } from './art/Icon';
import { SmokeLayer } from './art/SmokeLayer';
import { KitBoundary } from './KitBoundary';
import { Placeholder } from './Placeholder';
import { Reveal } from './Reveal';
import type { SceneTree } from '../model/scene';

export interface MirrorWorldViewProps {
  readonly model: MirrorModel;
  readonly revealAll: boolean;
  readonly sceneOpen: boolean;
  readonly sceneRevealAll: boolean;
  readonly onReveal?: () => void;
  readonly onToggleScene?: () => void;
  readonly onRevealScene?: () => void;
}

function Cell(props: { cell: PaneCell }): ReactNode {
  const { cell } = props;
  return (
    <td>
      <div className="gk-cell-text">
        <span className="gk-state-tag" data-state={cell.state.text}>
          <Icon id={cell.state.icon} />
          <span>{cell.state.text}</span>
        </span>
        {cell.items.map((item, i) => (
          <div key={i}>
            {item.label === undefined ? null : <span>{`${item.label}: `}</span>}
            <code className="gk-mono">{item.text}</code>
          </div>
        ))}
      </div>
    </td>
  );
}

function Row({ row }: { row: ChangeRowModel }): ReactNode {
  const removed = row.vanish;
  return (
    <tr data-change-row={row.key}>
      <Cell cell={row.reality} />
      <td className="gk-cell-mirror">
        {removed ? <SmokeLayer /> : null}
        <div className="gk-cell-text">
          <span className="gk-state-tag" data-state={row.mirror.state.text}>
            <Icon id={row.mirror.state.icon} />
            <span>{row.mirror.state.text}</span>
          </span>
          {removed ? (
            <div className="gk-state-tag gk-state-removed" data-state="absent">
              <Icon id="cloud" />
              <span>{WOULD_BE_REMOVED}</span>
            </div>
          ) : null}
          {row.mirror.items.map((item, i) => (
            <div key={i}>
              {item.label === undefined ? null : <span>{`${item.label}: `}</span>}
              <code className="gk-mono">{item.text}</code>
            </div>
          ))}
          {row.extraLabels.map((label, i) => (
            <div key={`x${i}`} className="gk-note">
              {label}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

function SceneList({ tree, label, revealAll }: { tree: SceneTree | null; label: string; revealAll: boolean }): ReactNode {
  if (tree === null) return null;
  const rows = revealAll ? tree.rows : tree.rows.slice(0, tree.shown);
  return (
    <div>
      <h4 className="gk-subheading">{label}</h4>
      <ul className="gk-scene">
        {rows.map((r, i) => (
          <li key={i} className="gk-scene-entry" data-depth={r.depth}>
            {`${'  '.repeat(r.depth)}${r.key === '' ? '' : `${r.key}: `}${r.valueText}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pure view of a Mirror model. */
export function MirrorWorldView(props: MirrorWorldViewProps) {
  const { model, revealAll, sceneOpen, sceneRevealAll, onReveal, onToggleScene, onRevealScene } = props;
  const id = useId();
  const headingId = `${id}-h`;
  const sceneId = `${id}-scene`;
  const limit = revealAll ? Number.POSITIVE_INFINITY : model.shownRows;
  let used = 0;
  const hasScene = model.scene.real !== null || model.scene.mirror !== null;
  const sceneTotal = Math.max(model.scene.real?.total ?? 0, model.scene.mirror?.total ?? 0);
  const sceneLimited = sceneTotal > Math.max(model.scene.real?.shown ?? 0, model.scene.mirror?.shown ?? 0);

  return (
    <section className="gk-section" aria-labelledby={headingId}>
      <h2 className="gk-heading" id={headingId}>
        Mirror world
      </h2>
      <p className="gk-summary">
        <span className="gk-mono">{model.summary}</span>
      </p>
      {model.emptyText !== null ? <p className="gk-empty">{model.emptyText}</p> : null}
      <div className="gk-table-wrap">
        <table className="gk-table" aria-label="Changes in reality and in the mirror copy">
          <thead>
            <tr>
              <th scope="col">Reality</th>
              <th scope="col" className="gk-fog">
                Mirror (copy)
              </th>
            </tr>
          </thead>
          {model.steps.map((step) => {
            const rows = step.rows.filter(() => used++ < limit);
            return (
              <tbody key={step.stepIndex}>
                <tr className="gk-step-header">
                  <th scope="colgroup" colSpan={2}>
                    <span className="gk-mono">{`step ${step.stepIndex}`}</span>
                    {step.label === undefined ? null : <span>{` ${step.label}`}</span>}
                  </th>
                </tr>
                {step.unreadable ? (
                  <tr>
                    <td colSpan={2}>{unreadableItem(step.stepIndex)}</td>
                  </tr>
                ) : null}
                {rows.map((row) => (
                  <Row key={row.key} row={row} />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {!revealAll && model.shownRows < model.totalRows ? (
        <Reveal shown={model.shownRows} total={model.totalRows} noun="rows" {...(onReveal ? { onReveal } : {})} />
      ) : null}
      {hasScene ? (
        <div>
          <button
            type="button"
            className="gk-toggle"
            aria-expanded={sceneOpen}
            aria-controls={sceneId}
            onClick={onToggleScene}
          >
            <Icon id="chevron" open={sceneOpen} />
            <span>Full scene</span>
          </button>
          <div id={sceneId} hidden={!sceneOpen}>
            {sceneOpen ? (
              <>
                <SceneList tree={model.scene.real} label="Reality scene" revealAll={sceneRevealAll} />
                <SceneList tree={model.scene.mirror} label="Mirror scene" revealAll={sceneRevealAll} />
                {!sceneRevealAll && sceneLimited ? (
                  <Reveal
                    shown={Math.max(model.scene.real?.shown ?? 0, model.scene.mirror?.shown ?? 0)}
                    total={sceneTotal}
                    noun="scene entries"
                    {...(onRevealScene ? { onReveal: onRevealScene } : {})}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MirrorWorldInner(props: MirrorWorldProps) {
  const [revealAll, setRevealAll] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [sceneRevealAll, setSceneRevealAll] = useState(false);
  const model = buildMirrorModel(props);
  if (model.kind === 'unreadable') return <Placeholder name="MirrorWorld" />;
  return (
    <MirrorWorldView
      model={model}
      revealAll={revealAll}
      sceneOpen={sceneOpen}
      sceneRevealAll={sceneRevealAll}
      onReveal={() => setRevealAll(true)}
      onToggleScene={() => setSceneOpen((o) => !o)}
      onRevealScene={() => setSceneRevealAll(true)}
    />
  );
}

/** Container: state, boundary, Placeholder path. */
export function MirrorWorld(props: MirrorWorldProps) {
  return (
    <KitBoundary name="MirrorWorld">
      <MirrorWorldInner {...props} />
    </KitBoundary>
  );
}
