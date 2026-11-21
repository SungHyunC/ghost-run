import { KitRoot, RedThreadView } from '@ghost-run/ui';
import { actionLabels, links, needles } from '../sample-data';

export function ThreadRow() {
  return (
    <KitRoot>
      <RedThreadView needles={needles} links={links} actionLabels={actionLabels} />
    </KitRoot>
  );
}
