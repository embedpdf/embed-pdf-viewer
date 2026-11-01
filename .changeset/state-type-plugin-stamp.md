---
'@embedpdf/plugin-stamp': minor
---

A named type for the state: `StampState`, what `stampState` reads and `useStampState()` returns, the State table of the stamps page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `StampModel`, made by `initialStampModel()`, so `StampState` has one meaning.
