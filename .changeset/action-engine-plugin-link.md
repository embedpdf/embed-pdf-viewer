---
'@embedpdf/plugin-link': minor
---

`activate()` accepts an optional `LinkActivateContext`; when the actions plugin is installed and the item carries its `/A` tree, activation delegates to the dispatcher and returns the new `{ outcome: 'dispatched', dispatch }` arm — named verbs execute and mixed `/Next` chains behind links finally run. Without the actions plugin the classic root-projection path is unchanged.

Link `/AA` hover presence flags now ride `LinkNavItem` from the standalone source so the navigation layer can deliver cursorEnter/cursorExit without waking the annotation behavior plane.

Publish a bundle-safe `/contract` entry so navigation consumers can depend on the link protocol without pulling in source/effect/plugin wiring.
