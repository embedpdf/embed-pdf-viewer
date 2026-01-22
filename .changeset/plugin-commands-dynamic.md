---
'@embedpdf/plugin-commands': minor
---

Made `labelKey` dynamic, allowing it to be a function that returns different translation keys based on state. Added dynamic `icon` support so command icons can change at runtime. Added `registry` to the dynamic evaluation context for accessing other plugins. Made `ui` an optional dependency instead of not listed. Added early return in `detectCommandChanges` when document is not fully loaded.
