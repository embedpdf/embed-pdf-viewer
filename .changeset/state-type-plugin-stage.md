---
'@embedpdf/plugin-stage': minor
---

A named type for the state: `StageState`, what `stageState` reads and `useStageState()` returns, the State table of the Stage page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/contract/host`, is now `StageModel`, made by `initialStageModel()`, so `StageState` has one meaning.
