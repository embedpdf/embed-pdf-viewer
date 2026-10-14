---
'@embedpdf/react': minor
---

`useInteractionState()` returns `{ activeToolId, tools }`, built from the plugin's `interactionState` declaration: it takes a selector, and without a document `activeToolId` is `null` and `tools` is empty. `useInteractionSettings()` returns the interaction settings, with or without a document. `useTool()` and `useToolChanged()` are gone: use `useInteraction()` for the verbs, `useInteractionState()` for the state and `useInteractionEvent((interaction) => interaction.onToolChanged, handler)` for the event. `svgCursor` and `SvgCursorOptions` are exported from `/interaction`.

`useShellState()` returns `{ openSurfaces, openMenus }` and works without a document; `useMenus()` is gone. `useSurface(id).props` is an empty object for a surface opened without props.

`<Anchored>` flips to the other side of its box when the side you chose has no room, and stays inside the view, `gap` pixels from its edges, while the box is in view. It measures its content once it renders, and again when the content or the view changes size. An `anchor` without `bounds`, such as a search match with no geometry, hides it, as `null` does.
