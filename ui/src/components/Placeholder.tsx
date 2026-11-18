/** Fixed component names a Placeholder may show. */
export type ComponentName =
  | 'MirrorWorld'
  | 'Candle'
  | 'BlacklightView'
  | 'RedThreadView'
  | 'Graveyard'
  | 'SeanceView'
  | 'KitRoot';

/** Shown instead of a component whose input is unreadable. Contains only a fixed name, never data. */
export function Placeholder(props: { name: ComponentName }) {
  return (
    <div role="alert" className="gk-placeholder">
      {`Data unavailable: ${props.name} received unreadable input.`}
    </div>
  );
}
