import { useRef, type ReactNode } from 'react';
import type { RunsFile, WorldRecord } from '../data/types';
import { defaultScheduler, type Scheduler } from '../engine/scheduler';
import { goBadge } from '../engine/script';
import type { WalkView } from '../engine/types';
import { useInView } from '../engine/useInView';
import { useWalkthrough } from '../engine/useWalkthrough';
import { StepRail, WorldChips } from './walk/Controls';
import { Theater } from './walk/Theater';

export interface WalkthroughProps {
  runs: RunsFile;
  scheduler?: Scheduler;
  /** Reality pane body for the chosen world (task 11.2 supplies the panes). */
  renderReality?: (record: WorldRecord) => ReactNode;
  /** Copy pane body for the chosen world and walk state. */
  renderCopy?: (record: WorldRecord, view: WalkView) => ReactNode;
}

export function Walkthrough({ runs, scheduler = defaultScheduler, renderReality, renderCopy }: WalkthroughProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const { view, world, step, controls } = useWalkthrough(runs, scheduler, inView);
  const record = runs.worlds[world];

  return (
    <section className="sec" id="run" ref={ref}>
      <div className="sec-head">
        <span className="nbadge">3</span>
        <h2>Watch the ghost work</h2>
      </div>
      <p className="sec-sub">
        Pick a world. The ghost copies it, runs the agent's plan on the copy, lets the wards judge, and only a lit
        candle lets reality change.
      </p>
      <WorldChips world={world} onPick={controls.pickWorld} onReplay={controls.replay} />
      <StepRail step={step} onJump={controls.jump} />
      <Theater
        view={view}
        goText={goBadge(record)}
        reality={renderReality?.(record) ?? null}
        copy={renderCopy?.(record, view) ?? null}
      />
    </section>
  );
}
