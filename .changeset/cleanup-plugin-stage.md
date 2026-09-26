---
'@embedpdf/plugin-stage': minor
---

Stage events are derived from state changes in one place, with unchanged payloads. `StageAction` is no longer exported and the state's `vp` field is `viewport`. A controller built directly (`createStageController`) exposes the full `StageHostCapability` type, so optional parameters stay optional.
