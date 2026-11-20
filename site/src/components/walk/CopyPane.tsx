import type { WorldRecord } from '../../data/types';
import type { CopyItemState } from '../../engine/types';
import { CloudPane } from './panes/CloudPane';
import { HandPane } from './panes/HandPane';
import { ShellPane } from './panes/ShellPane';

export interface CopyPaneProps {
  record: WorldRecord;
  /** The copy items of the walk state. */
  copy: CopyItemState;
  /** True once the fixed plan is shown (`view.plan.rev`): the Hand tiles then come from the fixed run. */
  fixed?: boolean;
}

/** Body of `#copyb`: the world's items in the state the walk has given them. */
export function CopyPane({ record, copy, fixed = false }: CopyPaneProps) {
  const { reality } = record;
  if (reality.kind === 'shell' && copy.world === 'shell') return <ShellPane side="copy" scene={reality} state={copy} />;
  if (reality.kind === 'cloud' && copy.world === 'cloud') return <CloudPane side="copy" scene={reality} state={copy} />;
  if (reality.kind === 'hand' && copy.world === 'hand') {
    const after = (fixed ? record.fixed : record.plan).copyAfter;
    return <HandPane side="copy" tiles={after.kind === 'hand' ? after.tiles : []} state={copy} />;
  }
  return null;
}
