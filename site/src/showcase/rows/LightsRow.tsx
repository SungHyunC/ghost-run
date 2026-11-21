import { Candle, KitRoot } from '@ghost-run/ui';
import { CANDLE_STATES } from '../sample-data';

export function LightsRow() {
  const pass = CANDLE_STATES[0];
  const props = {
    ...(pass?.verdict === undefined ? {} : { verdict: pass.verdict }),
    ...(pass?.claims === undefined ? {} : { claims: pass.claims }),
  };
  return (
    <div className="klights">
      <KitRoot initialTheme="dark">
        <Candle {...props} />
      </KitRoot>
      <KitRoot initialTheme="light">
        <Candle {...props} />
      </KitRoot>
    </div>
  );
}
