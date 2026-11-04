---
'@embedpdf/snippet': patch
---

Fix two accessibility violations in the default toolbar: the mode-tabs overflow button (`tabs:overflow-menu`) now gets an accessible name by reusing the existing `menu.moreOptions` label (its `labelKey` pointed at a translation key that was never actually defined), and every toolbar icon `<svg>` is now marked `aria-hidden` instead of carrying a bare `role="img"` with no label when no explicit `title` is passed, since the icon is purely decorative inside an already-labeled button.
