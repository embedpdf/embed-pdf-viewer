---
'@embedpdf/plugin-selection': patch
---

### Selection plugin: Chrome PDFium parity and geometry cache eviction

**Double-click / triple-click selection**

- Double-click selects the word around the clicked glyph, triple-click selects the full visual line, matching Chromium's `PDFiumEngine::OnMultipleClick` behaviour.

**Drag threshold**

- Pointer-down no longer immediately begins a drag-selection. The pointer must move beyond a configurable `minSelectionDragDistance` (default 3 px) before selection starts, preventing accidental selections on simple clicks.

**Tolerance-based hit-testing with tight bounds**

- `glyphAt` now performs two-pass hit-testing adapted from PDFium's `CPDF_TextPage::GetIndexAtPos`: an exact-match pass followed by a tolerance-expanded nearest-neighbour pass using Manhattan distance.
- Hit-testing uses tight glyph bounds (`FPDFText_GetCharBox`) instead of loose bounds (`FPDFText_GetLooseCharBox`), matching Chrome's behaviour and preventing cross-line selection jumping on short lines. Configurable via `toleranceFactor` (default 1.5).

**Font-size-aware rectangle merging**

- `shouldMergeHorizontalRects` now refuses to merge runs whose font sizes differ by more than 1.5x, preventing a large character (e.g. a heading "1") from merging into adjacent body-text lines.
- `rectsWithinSlice` sub-splits runs when the horizontal gap between consecutive glyphs exceeds 2.5x the average glyph width, mirroring Chrome's `CalculateTextRunInfoAt` character-distance heuristic.

**Geometry cache eviction (LRU)**

- Added `maxCachedGeometries` config option (default 50) to bound per-document geometry memory. Least-recently-used pages are evicted when the limit is exceeded; pages with active UI registrations are pinned and never evicted.
- When an evicted page scrolls back into view and falls within an active selection, its rects are lazily recomputed and pushed to the UI.

**Marquee / text-selection coordination**

- Introduced `hasTextAnchor` state so the marquee handler does not activate while the text handler has a pending anchor (before the drag threshold is met).
