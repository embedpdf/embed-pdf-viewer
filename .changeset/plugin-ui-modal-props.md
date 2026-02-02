---
'@embedpdf/plugin-ui': minor
---

Added modal props feature to pass context when opening modals:

- Extended `openModal(modalId, props?)` to accept optional props parameter
- Added `props` field to `ModalSlotState` type
- Added `modalProps` to `ModalRendererProps` for all frameworks (Preact, React, Svelte, Vue)
- Updated schema renderers to pass `modalProps` through to modal components
