import { PartIcon } from './art/PartIcons';
import { PART_CARDS, PARTS_LABEL } from './copy';

export function PartCards() {
  return (
    <section className="kindex" aria-label={PARTS_LABEL}>
      {PART_CARDS.map((c) => (
        <a key={c.rowId} className="kcard" href={`#${c.rowId}`}>
          <PartIcon id={c.icon} />
          <b>{c.name}</b>
          <span>{c.line}</span>
        </a>
      ))}
    </section>
  );
}
