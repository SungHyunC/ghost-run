import { KitRoot, MirrorWorld } from '@ghost-run/ui';
import { changes, mirrorScene, realScene, stepLabels } from '../sample-data';

// No theme control here: the kit's own Lights switch in the frame is the theme control.
export function MirrorRow() {
  return (
    <KitRoot>
      <MirrorWorld changes={changes} realScene={realScene} mirrorScene={mirrorScene} stepLabels={stepLabels} />
    </KitRoot>
  );
}
