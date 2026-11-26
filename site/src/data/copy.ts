// The copy deck of the landing page (docs/design/pages-brief.md, section C).
// One source of truth for the texts of the five Book_Pages. Components read these values.

export const COVER = {
  kicker: '🎃 Kiroween 2026 · Skeleton Crew',
  headingBefore: "Let your agent's ",
  headingEm: 'ghost',
  headingAfter: ' try it first.',
  textBefore: 'A Kiro template where a ghost tries risky plans on a copy first. ',
  textBold: 'One skeleton, three costumes.',
  primaryButton: { text: 'Meet the skeleton', href: '#recipe' },
  secondaryButton: { text: 'Watch the ghost work', href: '#run' },
  appLinks: [
    { tag: 'App 1', name: 'Ghost Shell', label: 'shell and SQL', href: 'shell/' },
    { tag: 'App 2', name: 'Ghost Hand', label: 'a robot arm', href: 'hand/' },
  ],
} as const;

/** The sticker text has the token {lines}; the page fills it from the world-size data. */
export const LINES_TOKEN = '{lines}';

export const RECIPE_HEADS = {
  heading: "What's in the skeleton?",
  sub: 'Your world + the skeleton = a ghost-run app.',
  worldTitle: 'Your world',
  worldSub: 'Six functions.',
  sticker: `That's all. Ghost Cloud is about ${LINES_TOKEN} lines.`,
  skeletonTitle: 'The skeleton',
  skeletonSub: 'Ready-made and wired.',
  chipText: 'Built from 6 Kiro specs',
  resultTitle: 'Your ghost-run app',
  resultText: 'Copy → try → judge → candle.',
} as const;

export const COSTUMES_HEADS = {
  heading: 'One skeleton, three costumes',
  sub: 'Same skeleton, new costume. Flip on X-ray.',
  legend: "Crossed out = not on that app's screen.",
} as const;

export const RUN_HEADS = {
  heading: 'Watch the ghost work',
  sub: 'Give the ghost a plan. It tries it on a copy first.',
} as const;

export const MAKE_HEADS = {
  heading: 'Make your own costume',
  sub: 'Write six functions, or let a Kiro agent help.',
  spellbookTitle: '📖 A world in six functions',
  agentTitle: 'Ask world-smith',
  agentText: 'A Kiro agent that writes the world with you and runs the checks.',
  command: 'kiro-cli chat --agent world-smith',
  closing: '🎃 Ghost Cloud was made this way.',
} as const;
