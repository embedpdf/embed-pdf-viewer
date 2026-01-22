---
'@embedpdf/models': minor
---

Added `PdfAnnotationReplyType` enum with `Reply` and `Group` values to support annotation relationships per ISO 32000-2. Added `inReplyToId` and `replyType` properties to `PdfAnnotationObjectBase` for annotation grouping and reply threads. Extended `PdfLinkAnnoObject` with styling properties: `strokeColor`, `strokeWidth`, `strokeStyle`, and `strokeDashArray`. Deprecated `color` in favor of `strokeColor` for text markup and ink annotations. Deprecated `backgroundColor` in favor of `color` for free text annotations. Fixed documentation comments for squiggly, underline, and strikeout annotations.
