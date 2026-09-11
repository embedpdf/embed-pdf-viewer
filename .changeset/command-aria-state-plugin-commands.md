---
'@embedpdf/plugin-commands': minor
---

Add an optional `activeAriaState` field to `Command` (`'pressed' | 'expanded'`), resolved onto `ResolvedCommand`. It lets a command declare whether its `active` state represents a persistent toggle (aria-pressed) or an open/closed disclosure such as a menu or panel (aria-expanded), so framework adapters can expose the correct ARIA state without guessing from a command's id or categories.
