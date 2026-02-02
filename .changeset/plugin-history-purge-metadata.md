---
'@embedpdf/plugin-history': minor
---

Added history purging by command metadata:

- Added `purgeByMetadata()` method to remove history entries matching a predicate on command metadata
- Added generic `metadata` field to `Command` interface for attaching identifiable data to commands
- Enables permanent operations (like redaction commits) to clean up related undo/redo history
