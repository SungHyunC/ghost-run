---
inclusion: fileMatch
fileMatchPattern: ["ui/**", "apps/**"]
---

# Halloween Design System

Every visual element must explain a function. If removing the Halloween styling would make the UI harder to understand, the styling is doing its job. If it only decorates, cut it.

## Core Visual Elements

| Element | Function it explains |
|---|---|
| Mirror world (left = clear reality, right = foggy copy) | Shows what the diff is acting on |
| Candle (lit / flickering / out) | Communicates pass / warn / block at a glance |
| Blacklight + red thread | Reveals hidden characters; traces a possessed action to its source line |
| Graveyard (tombstones) | Audit log of blocked actions; each tombstone opens the seance detail view |
| Haunted variants | Multiple ghost arms running simultaneously; failed arms fade red |
| Salt line around protected paths | Shows which paths are warded (optional) |
| Lights-on mode | Single toggle switches to a bright, calm theme for everyday use |

## Tone

- **Calm ghost, not horror.** No blood, jump scares, or grotesque imagery.
- The tool is used by developers in professional contexts. Visual drama should build confidence, not distract.

## Colour

- Default theme: dark background.
- Lights-on theme: light background.
- Ghost elements: desaturated, semi-transparent.
- `block`: red. `warn`: amber. `pass`: neutral (candle warm white).
- Never rely on colour alone — pair every colour signal with an icon and a text label (WCAG 1.4.1).

## Typography & Numbers

- File paths, row counts, line numbers, and command strings: always monospace, always visible.
- No visual effect may obscure a number, path, or status label.

## Motion

- Keep animations short and quiet.
- Respect the OS `prefers-reduced-motion` setting — disable or simplify all transitions when it is set.

## Sound

- Off by default.
- Use only original audio or CC0 assets. List sources in README.

## Accessibility

- Colour contrast: WCAG AA minimum for all text and UI controls.
- Full keyboard navigation required.
- Screen reader labels on all interactive elements and status indicators.
- Video captions required (demo video and any embedded recordings).

## Prohibited

- Religious symbols (cross, crucifix). Use wards, salt lines, and talismans instead.
- Trademarks, logos, or characters belonging to other companies.
- Copyrighted music or audio.
- Real attack code displayed as UI content.
- Any visual effect that hides functional information (row counts, file paths, verdict text).
