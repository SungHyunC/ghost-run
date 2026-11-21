import { RUN_HEADS } from '../data/copy';
import type { ReactNode } from 'react';
import type { PageVisibility } from '../engine/paging';
import type { RunsFile, WorldRecord } from '../data/types';
import { defaultScheduler, type Scheduler } from '../engine/scheduler';
import { goBadge } from '../engine/script';
import type { WalkView } from '../engine/types';
import { useLiveWalkthrough } from '../engine/useLiveWalkthrough';
import type { LiveLoaders } from '../live/types';
import { PRESETS } from '../live/presets';
import { ControlCard } from './walk/ControlCard';
import { PlanBox } from './walk/PlanBox';
import { Stepper } from './walk/Stepper';
import { Theater } from './walk/Theater';

export interface WalkthroughProps {
  runs: RunsFile;
  /** The page visibility value: the engines load once Costumes or Run opened; the plan starts when Run opens. */
  visibility: PageVisibility;
  scheduler?: Scheduler;
  /** The lazy engine chunks; tests pass spies or fake engines. */
  loaders?: LiveLoaders;
  /** Reality pane body for the chosen world (task 11.2 supplies the panes). */
  renderReality?: (record: WorldRecord) => ReactNode;
  /** Copy pane body for the chosen world and walk state. */
  renderCopy?: (record: WorldRecord, view: WalkView) => ReactNode;
}

export function Walkthrough({ runs, visibility, scheduler = defaultScheduler, loaders, renderReality, renderCopy }: WalkthroughProps) {
  const { opened, current } = visibility;
  const active = current === 'run';
  const live = useLiveWalkthrough({
    runs,
    scheduler,
    visibility: { near: opened.costumes || opened.run, started: opened.run, active },
    ...(loaders === undefined ? {} : { loaders }),
  });
  const { walk, world, message, displayed, known } = live;
  const { view, step, record } = walk;
  // `viewRev`: the theater shows the Fixed_Plan run. `rev`: the box shows it too, until the visitor edits the box.
  const viewRev = view.plan.rev;
  const rev = viewRev && !live.edited;
  // A shown Fixed_Plan replaces the box content until the visitor acts (tab, Preset, Replay, or Run).
  const fixedHand = rev && known?.fix?.world === 'hand' ? known.fix : null;
  const shownText = rev && world !== 'hand' ? view.plan.text : live.text[world === 'hand' ? 'shell' : world];
  const shownPlan = viewRev ? (record.fixed ?? record.plan) : record.plan;
  const shownSliders =
    fixedHand === null ? live.sliders : { speed: fixedHand.speed, force: fixedHand.force, distance: fixedHand.distance };

  return (
    <section className="sec" id="run">
      <div className="sec-head">
        <span className="nbadge">3</span>
        <h2 tabIndex={-1}>{RUN_HEADS.heading}</h2>
        <span className={displayed === 'recorded' ? 'live rec' : 'live'} hidden={displayed === 'none'}>
          <i></i>
          {displayed === 'live' ? 'Live in your browser' : 'Recorded run'}
        </span>
      </div>
      <p className="sec-sub">{RUN_HEADS.sub}</p>
      <ControlCard world={world} onPick={live.pickWorld} onReplay={live.replay} rev={rev}>
        <PlanBox
          world={world}
          text={shownText}
          sliders={shownSliders}
          rev={rev}
          animating={walk.animating}
          busy={live.busy}
          presets={PRESETS[world].map((p) => ({ id: p.id, label: p.label }))}
          activeId={known?.id ?? null}
          onText={live.setText}
          onSliders={live.setSliders}
          onRun={live.run}
          onPreset={live.pickPreset}
        />
      </ControlCard>
      <Stepper step={step} disabledSteps={view.disabledSteps} onJump={live.jump} />
      {message === null ? null : (
        <p className="sec-sub" id="livenote" role="status">
          {message.text}
        </p>
      )}
      <Theater
        view={view}
        goText={goBadge(record)}
        reality={renderReality?.(record) ?? null}
        copy={renderCopy?.(record, view) ?? null}
        violatedWardIds={shownPlan.violatedWardIds}
        active={active}
      />
    </section>
  );
}
