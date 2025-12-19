---
'@embedpdf/engines': major
'@embedpdf/models': major
'@embedpdf/core': minor
---

# Remove `initialize()` - PDFium Now Initializes in Constructor

This release removes the `initialize()` method from all engine classes. PDFium is now automatically initialized in the constructor, simplifying the API and reducing boilerplate.

## Breaking Changes

### `initialize()` Method Removed

The `initialize()` method has been removed from:

- `PdfiumNative` (formerly `PdfiumEngine`)
- `PdfEngine` orchestrator
- `RemoteExecutor`
- `WebWorkerEngine`
- `IPdfiumExecutor` interface
- `PdfEngine` interface (in models)

**Migration:**

```typescript
// Before
const native = new PdfiumNative(wasmModule, { logger });
native.initialize();

const engine = new PdfEngine(native, { imageConverter, logger });
engine.initialize();

// After - no initialize() needed!
const native = new PdfiumNative(wasmModule, { logger });
const engine = new PdfEngine(native, { imageConverter, logger });

// Ready to use immediately
const doc = await engine.openDocumentBuffer(file).toPromise();
```

### Framework Hooks Simplified

The `usePdfiumEngine` hooks (React, Vue, Svelte) no longer require calling `initialize()`:

```typescript
// Before
const { engine, isLoading } = usePdfiumEngine();
const [initialized, setInitialized] = useState(false);

useEffect(() => {
  if (engine && !initialized) {
    engine.initialize().wait(setInitialized, ignore);
  }
}, [engine, initialized]);

// After - engine is ready when returned!
const { engine, isLoading } = usePdfiumEngine();

if (!isLoading && engine) {
  // Ready to use immediately
}
```

### `PluginRegistry.ensureEngineInitialized()` Removed

The `ensureEngineInitialized()` method and `engineInitialized` property have been removed from `PluginRegistry` since engines are now initialized in their constructors.

## Cross-Platform Image Data

### `ImageData` → `ImageDataLike`

The engine now returns `ImageDataLike` (a plain object with `data`, `width`, `height`) instead of the browser-specific `ImageData` class. This enables Node.js compatibility without polyfills.

**Affected types:**

- `PdfImageObject.imageData` now uses `ImageDataLike`
- All raw render methods return `ImageDataLike`

### Browser Converter Fallback

`browserImageDataToBlobConverter` now falls back to regular `<canvas>` when `OffscreenCanvas` is not available (older browsers). The hybrid converter (`createHybridImageConverter`) uses:

1. Worker pool with `OffscreenCanvas` (preferred, non-blocking)
2. Main-thread `<canvas>` fallback (blocking, but works everywhere)

## Benefits

- **Simpler API**: One less step to get started
- **Less boilerplate**: No more `initialize()` calls in every component
- **Node.js compatible**: `ImageDataLike` works without browser APIs
- **Broader browser support**: Canvas fallback for older browsers
