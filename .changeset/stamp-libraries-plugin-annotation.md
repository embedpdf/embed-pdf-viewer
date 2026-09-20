---
'@embedpdf/plugin-annotation': minor
---

Stamps can be placed without the pointer and ghosted at any zoom. `placeStamp(input, placement)` creates a stamp annotation by code — the same validation, fit, page clamp, `/Name`, and `/Subj` a click after `armStamp` produces — and resolves to the new annotation's ref; `StampPlacement` names the page, the anchor point, an optional width, and rotation. `StampToolInput` gains `name` (the placed `/Name`) and `subject` (the placed `/Subj`), and its `preview` now also accepts a `StampPreviewProvider`: a function the hover ghost asks for a render at the device pixel width it is displayed at. Requests are bucketed to powers of two (`previewBucket`) and cached per bucket for the arm's lifetime, so a zoom gesture never renders per frame. The host capability's `armedStampPreview(devicePixelWidth?)` is now asynchronous and takes that width.

`armStamp` no longer clears the payload it just set when activating the built-in stamp tool from another active tool. Armed stamps now place correctly instead of falling through to the tool's source callback, while the legacy `annotation-stamp` tool tag remains supported.
