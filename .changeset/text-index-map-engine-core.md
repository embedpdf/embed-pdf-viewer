---
'@embedpdf/engine-core': minor
---

Add an explicit character-to-text map to page text snapshots, with shared helpers for translating boundaries, converting text offsets to character ranges, slicing selected text, and validating the wire representation. Search hits are now defined in character space, and reusable conformance coverage verifies non-printing characters, supplementary-plane text, and exact search-to-selection round trips.
