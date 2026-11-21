import { Icon } from '../../components/art/Icon';
import type { PartIconId } from '../copy';
import { PartIcon } from './PartIcons';

const ORBIT: readonly PartIconId[] = ['mirror', 'candle', 'blacklight', 'thread', 'tomb', 'bulb'];

/** The ghost with the six part icons around it. Decorative. Needs the page `Sprite`. */
export function HeroArt() {
  return (
    <div className="khero-art" aria-hidden="true">
      <Icon id="boo" viewBox="0 0 120 130" className="kh-boo" />
      <div className="kh-orbit">
        {ORBIT.map((id, i) => (
          <span key={id} className={`o${i}`}>
            <PartIcon id={id} />
          </span>
        ))}
      </div>
    </div>
  );
}
