---
'@embedpdf/plugin-selection': minor
---

Add `setSelection(range, documentId?)` to the selection capability and document scope for programmatically applying or restoring a text selection.

It accepts the same `SelectionRangeX` (`{ start, end }` glyph pointers) shape emitted by `onSelectionChange`, so a saved selection can be passed straight back in to restore it; passing `null` clears the selection. Page geometry is loaded on demand, so the returned task resolves only once the highlight rects are computed. The range is normalized (start/end may be given in any order), invalid input (malformed range, non-integer/negative indices, out-of-bounds pages) is rejected, glyph indices are clamped to the available page geometry, and previously highlighted pages are repainted so switching to a disjoint selection no longer leaves stale highlights behind.
