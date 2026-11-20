import { memo } from 'react';
import type { RealityScene } from '../../data/types';
import { CloudPane } from './panes/CloudPane';
import { HandPane } from './panes/HandPane';
import { ShellPane } from './panes/ShellPane';

export interface RealityPaneProps {
  /** The recorded "Reality before the run" scene. Nothing else: no walk state reaches this pane. */
  scene: RealityScene;
}

/** Body of `#realb`. Its only prop is the recorded scene, so a step cannot change it. */
export const RealityPane = memo(function RealityPane({ scene }: RealityPaneProps) {
  switch (scene.kind) {
    case 'shell':
      return <ShellPane side="real" scene={scene} />;
    case 'hand':
      return <HandPane side="real" scene={scene} />;
    case 'cloud':
      return <CloudPane side="real" scene={scene} />;
  }
});
