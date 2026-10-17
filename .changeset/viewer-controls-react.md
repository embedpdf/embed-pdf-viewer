---
'@embedpdf/react': minor
---

`<Toolbar orientation="vertical">` stands a toolbar on its side: it measures heights and fits the height it's given, stacks its sections top, middle and bottom, and draws every command at `'icon'`, with the default menus opening beside it. The toolbar is now a `role="toolbar"` with `aria-orientation` and an optional `aria-label`, and one tab stop: the arrow keys along it move between its items (the first focusable element of your own item is its stop), past disabled ones, with Home and End to the ends. The default "More", folded-group and group-trigger menus open on their first row and take the arrow keys, typeahead, Enter, and Escape, which closes the menu and puts focus back on its button. `@embedpdf/react/toolbar` no longer re-exports the chrome schema helpers `@embedpdf/core-ui` dropped (`chromeHelpers`, `addItem`, `removeItems`, `replaceItem`, `defineChrome`, `validateChrome` and their types).

`useCommandShortcuts({ onRefused })` reports a key whose command is turned off or not allowed, with why; the key no longer reaches the browser. `<SelectionClipboard onRefused>` is called when Ctrl/Cmd+C or the browser's Copy meets a selection the user may not copy.

Under React 19, a renderer that only draws (`<AnnotationLayer>`) and the toolbar's measuring copies are `inert` again: React 19 dropped the empty string they set it with.
