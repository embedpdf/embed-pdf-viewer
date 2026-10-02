---
'@embedpdf/plugin-stage': minor
---

Stage events are derived from state changes in one place, with unchanged payloads. `StageAction` is no longer exported and the state's `vp` field is `viewport`. A controller built directly (`createStageController`) exposes the full `StageHostCapability` type, so optional parameters stay optional.

Stage layout, reveal, and navigation use durable page references and page-space coordinates, including transforms for pages with nondefault boxes and rotation.
