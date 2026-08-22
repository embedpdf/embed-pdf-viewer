---
'@embedpdf/plugin-stage': minor
'@embedpdf/plugin-interaction': minor
'@embedpdf/plugin-selection': patch
'@embedpdf/web': minor
'@embedpdf/react': minor
'@embedpdf/angular': minor
---

Touch gesture engine: native-feeling touch input for the Stage. One shared controller (`@embedpdf/web`) synthesizes the physics the platform scroller normally supplies — momentum fling on release (UIScrollView's deceleration curve, catchable mid-flight), pointer-tracked two-finger pinch anchored at the centroid, tap/double-tap-zoom/long-press classification — and arbitrates by modality: a finger navigates first (pan/pinch/fling under any tool, long-press hands to the hub as word-selection), while mouse and pen keep the tool-first routing unchanged. Safari `GestureEvent`s are demoted to desktop-trackpad-only so they no longer fight the pointer stream on iOS. The stage capability gains `beginGesture`/`endGesture` (one zoom-intent commit and one rest-settle per gesture instead of per event), `fling`, `cameraInMotion`, and `doubleTapZoom`; `PointerSample` gains `pointerType` and a `cancel` phase (with `onCancel` on handlers) so a second finger converts a tool gesture into a pinch without committing it; and `<SelectionHandles>` adds iOS-style draggable start/end handles for growing a touch selection.
