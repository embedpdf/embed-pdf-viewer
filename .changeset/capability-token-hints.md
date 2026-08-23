---
'@embedpdf/core': minor
'@embedpdf/plugin-interaction': patch
'@embedpdf/plugin-annotation': patch
---

Missing-dependency errors carry their own fix. `createCapabilityToken(name, { hint })` lets a token author the remedy, and the kernel's `requires` validation appends it: registering `selectionPlugin()` without the hub now fails with `Plugin "selection" requires capability "interaction", which no plugin provides — add interactionPlugin() from '@embedpdf/plugin-interaction' to your plugins list.` The plugin list stays an honest manifest (no auto-loading of behavior-bearing plugins — a dependency that changes what a drag does must be visible in the composition root); the error just makes the one-line fix a paste instead of an investigation. Hints shipped for the tokens other plugins `require` today: interaction and annotation.
