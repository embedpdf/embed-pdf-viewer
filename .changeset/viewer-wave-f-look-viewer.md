---
'@embedpdf/viewer': minor
---

`theme` takes `accent`, and `tokens` and `dark` take the Theming page's tokens: `accent`, `background`, `surface`, `surface-raised`, `text`, `text-muted`, `border`, `hover`, `canvas`, `radius` and `font`. Each is also the CSS variable `--epdf-<name>`, which the page can set on `<embedpdf-viewer>` or around it, and which wins over the config, in light and in dark. The viewer's root takes its font and text color from `--epdf-font` and `--epdf-text`. `ThemeConfig`, `ThemeToken` and `ThemeTokens` are exported.

Every bar and every button in a bar is a part page CSS reaches with `::part()` (`toolbar`, `toolbar-button`), and the bars over a selection sit above it, below it when there's no room.
