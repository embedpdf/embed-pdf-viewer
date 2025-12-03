---
'@embedpdf/engines': minor
---

## Multi-Document Support

Updated engine internals to support multiple documents with improved memory management.

### Changes

- **Memory Management**: Enhanced memory tracking through `MemoryManager` for proper cleanup of multiple document instances.

- **Cache**: `PdfCache` now properly tracks and manages multiple document contexts with improved memory management through the memory manager.

### Technical Details

- Document contexts now use `MemoryManager` for proper WASM pointer tracking and cleanup
- Improved resource management for concurrent document handling
