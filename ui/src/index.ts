// Public entry of @ghost-run/ui.
// The stylesheet is exposed separately as "@ghost-run/ui/styles.css" (package.json exports).
// Not exported on purpose: LightsToggle alone, model internals (IconId, limits, guards), server modules.

export { Candle } from './components/Candle';
export { MirrorWorld } from './components/MirrorWorld';
export { BlacklightView } from './components/BlacklightView';
export { RedThreadView } from './components/RedThreadView';
export { Graveyard } from './components/Graveyard';
export { SeanceView } from './components/SeanceView';
export { KitRoot } from './components/KitRoot';

export type {
  BlacklightSource,
  BlacklightViewProps,
  CandleProps,
  GraveDetail,
  GraveEntry,
  GraveyardProps,
  IsolationClaims,
  IsolationMode,
  IsolationReason,
  KitRootProps,
  MirrorWorldProps,
  RedThreadViewProps,
  SeanceViewProps,
  Theme,
} from './types';

export { THEMES } from './theme/tokens';
export type { ThemeTokens } from './theme/tokens';

// Same display rule for Ghost Shell and the kit.
export { escapeForDisplay, isHiddenDisplay } from './model/escape';
