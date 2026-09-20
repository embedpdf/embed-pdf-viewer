---
'@embedpdf/engine-services': minor
---

Add signature readers, revision and working-copy analysis, two-phase signing, and session-independent candidate finalization. Support signature-field creation and visual appearances, enforce declared document and field restrictions, and install completed signatures as new immutable bases.

Preserve loaded bytes for unchanged or reverted edits. Use file-backed candidates, layer artifacts, overlays, and streamed downloads for native file sessions to reduce memory use, while retaining buffer-based support for WASM sessions.
