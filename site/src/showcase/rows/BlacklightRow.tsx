import { BlacklightView, KitRoot } from '@ghost-run/ui';
import { blacklightSources } from '../sample-data';

export function BlacklightRow() {
  return (
    <KitRoot>
      <BlacklightView sources={blacklightSources} />
    </KitRoot>
  );
}
