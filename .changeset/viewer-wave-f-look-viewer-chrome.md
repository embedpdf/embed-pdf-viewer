---
'@embedpdf/viewer-chrome': minor
---

The viewer's look is the public `--epdf-*` variables: `--epdf-accent`, `--epdf-background`, `--epdf-surface`, `--epdf-surface-raised`, `--epdf-text`, `--epdf-text-muted`, `--epdf-border`, `--epdf-hover`, `--epdf-canvas`, `--epdf-radius` and `--epdf-font`. The stylesheet declares each on the viewer's root with a default for light and for dark, and mixes every other shade from them, so the chrome's hover, pressed, tinted and secondary colors and its corners follow them. A value the page sets on the viewer or around it wins over the config and the defaults, and your own components in the viewer can use every one. The chrome's own `--ep-*` variables are gone.

`theme` takes `accent` next to `preference`, `tokens` and `dark`, and `tokens` and `dark` take the token names above (`THEME_TOKENS`, typed as `ThemeTokens`); another name warns and is ignored. `themeTokenCss()` turns a theme into the CSS a delivery applies on the viewer's root, in place of `themeTokenProperty()`.

Every bar is the `toolbar` part: the bars along the edges, a floating bar's pill and the bars over selected text and a selected annotation. Every button in a bar is `toolbar-button` (with `toolbar-button-active` while it's pressed or its menu is open): the zoom field's buttons, "More", a folded group's button and the bars over a selection's buttons too. The chevron the mode tabs fold behind is a `mode-tab`, `mode-tab-active` while the open mode is behind it.

The bar over selected text and the bar over a selected annotation sit above it, and below it when there's no room above; on a touch screen the text's bar keeps clear of the selection handles. A menu from either opens on the side the bar sits, away from the selection.
