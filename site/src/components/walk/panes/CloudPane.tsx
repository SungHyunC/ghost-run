import type { CSSProperties } from 'react';
import type { RealityScene } from '../../../data/types';
import type { CopyItemState } from '../../../engine/types';
import { Icon } from '../../art/Icon';

type CloudScene = Extract<RealityScene, { kind: 'cloud' }>;
type CloudState = Extract<CopyItemState, { world: 'cloud' }>;

export type CloudPaneProps = { scene: CloudScene } & ({ side: 'real' } | { side: 'copy'; state: CloudState });

const idx = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

/** The scene builder `cloudPane` of the Mockup. The shield marks `prod-` buckets. */
export function CloudPane(props: CloudPaneProps) {
  const { scene } = props;
  const state = props.side === 'copy' ? props.state : null;
  return (
    <div className="buckets">
      {scene.buckets.map((b, k) => {
        const st = state?.buckets.find((x) => x.name === b.name)?.state ?? 'idle';
        const cls = st === 'poof' ? 'bucket poof' : st === 'vanish' ? 'bucket poof vanish' : 'bucket';
        return (
          <div className={cls} data-b={b.name} key={b.name} style={idx(k)}>
            {b.name.startsWith('prod-') ? <Icon id="i-lock" viewBox="0 0 16 16" className="shield" /> : null}
            <Icon id="i-bucket" viewBox="0 0 40 40" />
            <b>{b.name}</b>
            <div className="objs">
              {b.objects.map((o) => (
                <span key={o}>{o}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
