import { useRef, type ReactNode } from 'react';
import type { RunsFile, WorldRecord } from '../data/types';
import { defaultScheduler, type Scheduler } from '../engine/scheduler';
import { goBadge } from '../engine/script';
import type { WalkView } from '../engine/types';
import { useInView } from '../engine/useInView';
import { useLiveWalkthrough } from '../engine/useLiveWalkthrough';
import type { LiveLoaders } from '../live/types';
import { PRESETS } from '../live/presets';
import { ControlCard } from './walk/ControlCard';
import { PlanBox } from './walk/PlanBox';
import { Stepper } from './walk/Stepper';
import { Theater } from './walk/Theater';

/** The section is "near" 200 px before it enters the viewport; the engines may load then. */
const NEAR_OPTIONS = { rootMargin: '200px 0px', threshold: 0 } as const;

export interface WalkthroughProps {
  runs: RunsFile;
  scheduler?: Scheduler;
  /** The lazy engine chunks; tests pass spies or fake engines. */
  loaders?: LiveLoaders;
  /** Reality pane body for the chosen world (task 11.2 supplies the panes). */
  renderReality?: (record: WorldRecord) => ReactNode;
  /** Copy pane body for the chosen world and walk state. */
  renderCopy?: (record: WorldRecord, view: WalkView) => ReactNode;
}

export function Walkthrough({ runs, scheduler = defaultScheduler, loaders, renderReality, renderCopy }: WalkthroughProps) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref);
  const near = useInView(ref, NEAR_OPTIONS);
  const live = useLiveWalkthrough({ runs, scheduler, visibility: { near, seen }, ...(loaders === undefined ? {} : { loaders }) });
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
    <section className="sec" id="run" ref={ref}>
      <div className="sec-head">
        <span className="nbadge">3</span>
        <h2>Watch the ghost work</h2>
        <span className={displayed === 'recorded' ? 'live rec' : 'live'} hidden={displayed === 'none'}>
          <i></i>
          {displayed === 'live' ? 'Live in your browser' : 'Recorded run'}
        </span>
      </div>
      <p className="sec-sub">
        Give the ghost a plan. It tries it on a copy first, and only a lit candle lets reality change.
      </p>
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
      />
    </section>
  );
}
