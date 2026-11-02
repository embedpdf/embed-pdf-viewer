---
'@embedpdf/core-ui': minor
---

Layout:

- `panel(id, changes)` takes `title` (the same in every language), `open` (open when a document opens, where the panel docks) and `closable: false` (no close button where it docks; another panel on its side can take its place, and it comes back when that one closes). A `title` takes out a `titleKey` and a `titleKey` a `title`. `resizable`, `open` and `closable` must be booleans.
- `removeBar()` takes one id or a list, and takes out every bar that rides along a removed one, and theirs.
- A floating bar's place takes `hideWhileScrolling` (`FloatPlace`), and `hideWhileScrollingOf(data, id)` reads it, through the bar it rides along.
- Item options: `grow: true` on your own component takes the room the bar has left, and `emphasis: 'primary'` (`Emphasis`) on a command's button makes it the bar's main button. Both are checked: `grow` only on a custom item, `emphasis` only on a command.
- The toolbar layout fits an item that grows at its own length, then grows it and its section into the rest: each section of the live row says whether it `grows`, and its `spacing` (`SectionSpacing`: `'balance'` centers it in the room the others leave, `'gap'` keeps the toolbar's gap before it, `'none'`).
