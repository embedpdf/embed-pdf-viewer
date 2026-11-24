---
'@embedpdf/svelte': patch
---

Stop a press on `<Scrollbar>` from also panning the page. The Stage listens for presses on an ancestor of the bar, and Svelte ran the bar's own handler after the Stage had already seen the press, so a thumb drag moved the page the other way too: the view scrolled a little less than the thumb asked for, and went backwards once the thumb reached the end of its track. The bar now takes its presses on the track itself, so the Stage never sees them.
