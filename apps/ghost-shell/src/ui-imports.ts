// The single module through which the app imports @ghost-run/ui, so a kit change touches one file.
//
// Resolved exports of @ghost-run/ui used by the app (verified by tests/prereqs.test.ts):
//   Components: Candle, MirrorWorld, BlacklightView, RedThreadView, Graveyard, SeanceView, KitRoot
//   Prop types: CandleProps { verdict?: WardVerdict; claims?: IsolationClaims }
//               MirrorWorldProps { changes; realScene?; mirrorScene?; stepLabels? }
//               BlacklightViewProps { sources: BlacklightSource[] }
//               RedThreadViewProps { needles; links; actionLabels? }
//               GraveyardProps { entries: GraveEntry[]; onOpenSeance(id) }
//               SeanceViewProps, KitRootProps
//   Types: IsolationClaims { mode: 'docker-box' | 'static-analysis' | 'playground'; p1Claimed; p5Claimed;
//          p6Claimed; reason?: 'docker-unavailable' | 'box-image-missing' | 'static-analysis' | 'unsupported-step';
//          notApplicable? }, IsolationMode, IsolationReason, BlacklightSource, GraveEntry, GraveDetail, Theme
//   Functions: escapeForDisplay, isHiddenDisplay (the only display escaper of the app)
// The notice kind of a verdict is the WardNotice kind of @ghost-run/core, used as is.

export {
  BlacklightView,
  Candle,
  Graveyard,
  KitRoot,
  MirrorWorld,
  RedThreadView,
  SeanceView,
  escapeForDisplay,
  isHiddenDisplay,
} from '@ghost-run/ui';

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
} from '@ghost-run/ui';
