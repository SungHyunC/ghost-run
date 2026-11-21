// The Dropped_Texts of site-pages Requirement 12, held as literals so that a change in a
// data module cannot change what the tests forbid. Shared by the DOM and unit tests.
//
// `text` entries are matched as substrings. `line` entries are short strings (a folder line
// or a tag) that are matched only when they make up a whole text node, a whole attribute
// value, or a whole quoted string literal, so that imports such as '../core/x' are not hits.
// `prefix` entries are label prefixes, matched only at the start of a text node, an attribute
// value, or a string literal, so that code such as `myWorld: World<S, A>` is not a hit.

export interface Dropped {
  readonly text: string;
  readonly kind: 'text' | 'line' | 'prefix';
}

const t = (text: string): Dropped => ({ text, kind: 'text' });
const l = (text: string): Dropped => ({ text, kind: 'line' });
const p = (text: string): Dropped => ({ text, kind: 'prefix' });

/** Requirement 12, criterion 1: the Landing_Page. */
export const LANDING_DROPPED: readonly Dropped[] = [
  t('Every ghost-run app is a recipe with two ingredients.'),
  t('You write six functions.'),
  t('You get all of this, already wired together.'),
  t('Built with Kiro specs:'),
  l('core/'),
  l('ui/'),
  l('ghost-runner/'),
  l('wards-config/'),
  l('integrations/'),
  l('.kiro/agents/'),
  t('core/ · ui/'),
  t('ghost-runner/ · wards-config/'),
  t('integrations/ · .kiro/agents/'),
  t('Skeleton parts on its screen'),
  t('Skeleton parts it uses (no screen yet)'),
  l('worlds/playground-shell'),
  l('worlds/drawer-arm'),
  l('worlds/ghost-cloud'),
  p('Costume: '),
  p('World: '),
  t('Each app is the same skeleton in a different costume. Turn on X-ray to see the bones.'),
  t("Crossed-out parts are not on that app's screen. The costume is what each app adds: its world and its own screens."),
  t('A Kiro template for apps that rehearse risky plans on a ghost copy of the world.'),
  t('It copies the world, lets a ghost try the plan, judges it with your wards, and shows the verdict as a candle.'),
  t('Write six functions, or let a Kiro agent write them with you.'),
  t('The spell: a world in six functions'),
  t(
    'A Kiro custom agent. It copies the spec template, writes the world with you one file at a time, and runs the registration gate and the wards.',
  ),
  t(', and only a lit candle lets reality change'),
];

/** Requirement 12, criterion 2: the Showcase (texts of Mockup_Kit that the deck replaces or drops). */
export const SHOWCASE_DROPPED: readonly Dropped[] = [
  t(
    "Worlds bring the data. These parts draw it, the same way in every app. They never decide anything: the engine judges, the kit only shows what it was given.",
  ),
  l('Used by Ghost Shell'),
  l('Used by Ghost Hand'),
  t('Pinned by 11 render rules'),
  // Card lines and tags.
  t("Reality next to the ghost's copy, change by change."),
  t('Lit: go. Flickering: ask a human. Out: stop.'),
  t('Reveals instructions hidden in what the agent read.'),
  t('Ties a blocked step to the line that caused it.'),
  t('Every stopped plan, its ward and its time.'),
  t('A light theme with the same meanings.'),
  l('Shell · Hand'),
  // Frame bar captions.
  t('as it appears in Ghost Shell'),
  t('as it appears in Ghost Hand'),
  t('dark and lights on'),
  // Row texts that differ from Requirement 13, criterion 7.
  t("Reality on the left, the ghost's copy on the right, one row per change."),
  t('Deleted files, overwritten files and lost rows are marked in red.'),
  t('Fields that look like secrets are hidden as'),
  t('Unrecognized changes are shown, never dropped.'),
  t('The verdict at a glance. The claims under it say what this run proved.'),
  t('Lit: go. Flickering'),
  t('Turn it on and the hidden letters glow.'),
  t('Finds zero-width and direction-control characters, and HTML comments.'),
  t('Shows where they sit, line and column.'),
  t('Says plainly what text analysis cannot catch.'),
  t("From the blocked step to the line that put the idea in the agent's head."),
  t('Links only literal matches, never guesses.'),
  t('is said out loud, and never means safe.'),
  t('Every plan the wards stopped rests here.'),
  t('One tombstone per blocked command, with its ward and time.'),
  t('Open a tombstone to read the seance: what was tried and why it stopped.'),
  t('The same screens for bright rooms and printouts.'),
  t('Every color keeps its meaning: red still stops, green still goes.'),
  t('Contrast rules are checked in both themes.'),
];

export interface RenderedParts {
  /** Whole text content of the rendered page. */
  readonly text: string;
  /** Own text of each element, trimmed. */
  readonly nodes: readonly string[];
  /** Every `title` and `aria-label` value. */
  readonly attrs: readonly string[];
}

/** The texts of `list` that appear in the rendered parts. */
export function findRendered(parts: RenderedParts, list: readonly Dropped[]): string[] {
  const pool = [...parts.nodes, ...parts.attrs];
  return list
    .filter((d) => {
      if (d.kind === 'text') return parts.text.includes(d.text) || parts.attrs.some((a) => a.includes(d.text));
      if (d.kind === 'prefix') return pool.some((x) => x.startsWith(d.text));
      return pool.some((x) => x === d.text);
    })
    .map((d) => d.text);
}

/** Like findRendered, but throws when anything is found (the check that the fixture must trip). */
export function assertNoneRendered(parts: RenderedParts, list: readonly Dropped[]): void {
  const hits = findRendered(parts, list);
  if (hits.length > 0) throw new Error(`dropped text rendered: ${JSON.stringify(hits)}`);
}

/** Collect the rendered parts of a DOM subtree. */
export function collect(root: Element): RenderedParts {
  const nodes: string[] = [];
  const attrs: string[] = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    if (own !== '') nodes.push(own);
    for (const name of ['title', 'aria-label']) {
      const v = el.getAttribute(name);
      if (v !== null) attrs.push(v);
    }
  }
  return { text: root.textContent ?? '', nodes, attrs };
}

/** The hits of `list` in source or built text, as readable labels. */
export function findInSource(content: string, list: readonly Dropped[]): string[] {
  return list
    .filter((d) => {
      if (d.kind === 'text') return content.includes(d.text);
      const e = d.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (d.kind === 'prefix') return new RegExp(`(['"\`]${e})|(>\\s*${e})`).test(content);
      // A whole quoted string literal or a whole JSX/HTML text node.
      return new RegExp(`(['"\`]${e}['"\`])|(>\\s*${e}\\s*<)`).test(content);
    })
    .map((d) => d.text);
}
