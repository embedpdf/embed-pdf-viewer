---
'@embedpdf/plugin-ui': minor
---

Add overlay enable/disable functionality:

- Add `SET_OVERLAY_ENABLED` action and `setOverlayEnabled` action creator
- Add `enabledOverlays` state to `UIDocumentState` for tracking overlay visibility
- Add overlay management methods to `UIScope`: `enableOverlay`, `disableOverlay`, `toggleOverlay`, `isOverlayEnabled`, `getEnabledOverlays`
- Add `onOverlayChanged` event hook for overlay state changes
- Update schema renderer to filter overlays by enabled state
- Initialize overlay enabled state from schema's `defaultEnabled` property
