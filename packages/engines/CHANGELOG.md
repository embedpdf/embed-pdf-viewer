# @embedpdf/engines

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add document security/encryption engine methods:
  - Add `setDocumentEncryption` for setting AES-256 encryption with user/owner passwords and permission flags
  - Add `removeEncryption` for marking documents for encryption removal on save
  - Add `unlockOwnerPermissions` for unlocking owner permissions on encrypted documents
  - Add `isEncrypted` and `isOwnerUnlocked` query methods
  - Implement security methods in `PdfEngine` orchestrator, `RemoteExecutor`, `PdfiumNative`, `WebWorkerEngine`, and `EngineRunner`
  - Query and store `isEncrypted`, `isOwnerUnlocked`, and `permissions` when opening documents

## 2.1.2

## 2.1.1

## 2.1.0

### Minor Changes

- [#361](https://github.com/embedpdf/embed-pdf-viewer/pull/361) by [@bobsingor](https://github.com/bobsingor) – Add font fallback system for PDFs with non-embedded fonts
  - **FontFallbackManager**: Pure TypeScript implementation using Emscripten's `addFunction` API to hook into PDFium's `FPDF_SYSFONTINFO` interface
  - **CDN font loading**: Default configuration loads fonts from `@embedpdf/fonts-*` packages via jsDelivr CDN
  - **Advanced font matching**: Supports multiple font weights and italic variants with CSS-like matching algorithm
  - **Node.js support**: `createNodeFontLoader` helper for file system-based font loading
  - **Framework integration**: `fontFallback` option added to React, Vue, Svelte, and Preact hooks
  - **Worker support**: Font fallback enabled by default in browser worker engine (uses CDN)

  Supported charsets: Japanese (SHIFTJIS), Korean (HANGEUL), Simplified Chinese (GB2312), Traditional Chinese (CHINESEBIG5), Arabic, Hebrew, Cyrillic, Greek, Vietnamese

## 2.0.2

### Patch Changes

- [#358](https://github.com/embedpdf/embed-pdf-viewer/pull/358) by [@bobsingor](https://github.com/bobsingor) – Added support for persisting custom annotation data when creating text, freetext, ink, line, polygon, polyline, shape, and stamp annotations.

- [#359](https://github.com/embedpdf/embed-pdf-viewer/pull/359) by [@bobsingor](https://github.com/bobsingor) – Fixed missing author field when creating stamp annotations.

## 2.0.1

## 2.0.0

### Major Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – # Major Engine Architecture Refactor: Orchestrator Layer & Image Encoding Pool

  This release introduces a significant architectural improvement to the PDF engine system, separating concerns between execution and orchestration while adding parallel image encoding capabilities.

  ## Breaking Changes

  ### Engine Class Renamed
  - `PdfiumEngine` → `PdfiumNative` (the "dumb" executor)
  - New `PdfEngine` class wraps executors with orchestration logic
  - Factory functions (`createPdfiumEngine`) now return the orchestrated `PdfEngine<Blob>` wrapper

  **Migration:**

  ```typescript
  // Before
  import { PdfiumEngine } from '@embedpdf/engines';
  const engine = new PdfiumEngine(wasmModule, { logger });

  // After
  import { createPdfiumEngine } from '@embedpdf/engines/pdfium-worker-engine';
  // or
  import { createPdfiumEngine } from '@embedpdf/engines/pdfium-direct-engine';

  const engine = await createPdfiumEngine('/wasm/pdfium.wasm', {
    logger,
    encoderPoolSize: 2, // Optional: parallel image encoding
  });
  ```

  ### Rendering Methods Changed
  - `renderPage()` → Returns final encoded result (Blob) via orchestrator
  - `renderPageRaw()` → New method, returns raw `ImageData` from executor
  - `renderThumbnail()` → `renderThumbnailRaw()` for raw data
  - `renderPageAnnotation()` → `renderPageAnnotationRaw()` for raw data

  ### Search API Simplified
  - `searchAllPages()` → Now orchestrated at the `PdfEngine` level
  - `searchInPage()` → New single-page search method in executor
  - Progress tracking improved with proper `CompoundTask` support

  ### Document Loading Changes
  - Removed `openDocumentFromLoader()` - range request loading removed from executor
  - Removed `openDocumentUrl()` - URL fetching now handled in orchestrator
  - `openDocumentBuffer()` remains as the primary method in executor

  ## New Features

  ### 1. Orchestrator Architecture

  New three-layer architecture:
  - **Executor Layer** (`PdfiumNative`, `RemoteExecutor`): "Dumb" workers that execute PDF operations
  - **Orchestrator Layer** (`PdfEngine`): "Smart" coordinator with priority queues and scheduling
  - **Worker Pool** (`ImageEncoderWorkerPool`): Parallel image encoding

  Benefits:
  - Priority-based task scheduling
  - Visibility-aware rendering (viewport-based prioritization)
  - Parallel image encoding (non-blocking)
  - Automatic task cancellation and cleanup

  ### 2. Image Encoder Worker Pool

  ```typescript
  const engine = await createPdfiumEngine('/wasm/pdfium.wasm', {
    encoderPoolSize: 2, // Creates 2 encoder workers
  });
  ```

  - Offloads `OffscreenCanvas.convertToBlob()` from main PDFium worker
  - Prevents blocking during image encoding
  - Configurable pool size (default: 2 workers)
  - Automatic load balancing

  ### 3. Task Queue System

  New `WorkerTaskQueue` with:
  - Priority levels: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
  - Visibility-based ranking for render tasks
  - Automatic task deduplication
  - Graceful cancellation

  ### 4. CompoundTask for Multi-Page Operations

  New `CompoundTask` class for aggregating results:

  ```typescript
  // Automatic progress tracking
  const task = engine.searchAllPages(doc, 'keyword');
  task.onProgress((progress) => {
    console.log(`Page ${progress.page} complete`);
  });
  ```

  - `CompoundTask.gather()` - Like `Promise.all()` with progress
  - `CompoundTask.gatherIndexed()` - Returns `Record<number, Result>`
  - `CompoundTask.first()` - Like `Promise.race()`
  - Automatic child task cleanup

  ## API Additions

  ### Models Package
  - `CompoundTask` - Multi-task aggregation with progress
  - `ImageConversionTypes` type refinements
  - `PdfAnnotationsProgress.result` (renamed from `annotations`)

  ### Engines Package

  New exports:
  - `PdfEngine` - Main orchestrator class
  - `RemoteExecutor` - Worker communication proxy
  - `ImageEncoderWorkerPool` - Image encoding pool
  - `WorkerTaskQueue` - Priority-based queue
  - `PdfiumNative` - Renamed from `PdfiumEngine`

  New image converters:
  - `browserImageDataToBlobConverter` - Legacy converter
  - `createWorkerPoolImageConverter()` - Pool-based converter
  - `createHybridImageConverter()` - Fallback support

  ### Plugin-Render Package

  New config options:

  ```typescript
  {
    render: {
      defaultImageType: 'image/webp',
      defaultImageQuality: 0.92
    }
  }
  ```

  ## Improvements
  - **Performance**: Parallel image encoding improves render throughput by ~40-60%
  - **Responsiveness**: Priority queues ensure visible pages render first
  - **Memory**: Better cleanup of completed tasks and worker references
  - **Logging**: Enhanced performance logging with duration tracking
  - **Developer Experience**: Clearer separation of concerns

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – # Remove `initialize()` - PDFium Now Initializes in Constructor

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

### Minor Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  Updated engine internals to support multiple documents with improved memory management.

  ### Changes
  - **Memory Management**: Enhanced memory tracking through `MemoryManager` for proper cleanup of multiple document instances.
  - **Cache**: `PdfCache` now properly tracks and manages multiple document contexts with improved memory management through the memory manager.

  ### Technical Details
  - Document contexts now use `MemoryManager` for proper WASM pointer tracking and cleanup
  - Improved resource management for concurrent document handling

## 2.0.0-next.3

### Major Changes

- [`f13b2d4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f13b2d48eebd7b2f02e881fee80f68bf4219c1d6) by [@bobsingor](https://github.com/bobsingor) – # Major Engine Architecture Refactor: Orchestrator Layer & Image Encoding Pool

  This release introduces a significant architectural improvement to the PDF engine system, separating concerns between execution and orchestration while adding parallel image encoding capabilities.

  ## Breaking Changes

  ### Engine Class Renamed
  - `PdfiumEngine` → `PdfiumNative` (the "dumb" executor)
  - New `PdfEngine` class wraps executors with orchestration logic
  - Factory functions (`createPdfiumEngine`) now return the orchestrated `PdfEngine<Blob>` wrapper

  **Migration:**

  ```typescript
  // Before
  import { PdfiumEngine } from '@embedpdf/engines';
  const engine = new PdfiumEngine(wasmModule, { logger });

  // After
  import { createPdfiumEngine } from '@embedpdf/engines/pdfium-worker-engine';
  // or
  import { createPdfiumEngine } from '@embedpdf/engines/pdfium-direct-engine';

  const engine = await createPdfiumEngine('/wasm/pdfium.wasm', {
    logger,
    encoderPoolSize: 2, // Optional: parallel image encoding
  });
  ```

  ### Rendering Methods Changed
  - `renderPage()` → Returns final encoded result (Blob) via orchestrator
  - `renderPageRaw()` → New method, returns raw `ImageData` from executor
  - `renderThumbnail()` → `renderThumbnailRaw()` for raw data
  - `renderPageAnnotation()` → `renderPageAnnotationRaw()` for raw data

  ### Search API Simplified
  - `searchAllPages()` → Now orchestrated at the `PdfEngine` level
  - `searchInPage()` → New single-page search method in executor
  - Progress tracking improved with proper `CompoundTask` support

  ### Document Loading Changes
  - Removed `openDocumentFromLoader()` - range request loading removed from executor
  - Removed `openDocumentUrl()` - URL fetching now handled in orchestrator
  - `openDocumentBuffer()` remains as the primary method in executor

  ## New Features

  ### 1. Orchestrator Architecture

  New three-layer architecture:
  - **Executor Layer** (`PdfiumNative`, `RemoteExecutor`): "Dumb" workers that execute PDF operations
  - **Orchestrator Layer** (`PdfEngine`): "Smart" coordinator with priority queues and scheduling
  - **Worker Pool** (`ImageEncoderWorkerPool`): Parallel image encoding

  Benefits:
  - Priority-based task scheduling
  - Visibility-aware rendering (viewport-based prioritization)
  - Parallel image encoding (non-blocking)
  - Automatic task cancellation and cleanup

  ### 2. Image Encoder Worker Pool

  ```typescript
  const engine = await createPdfiumEngine('/wasm/pdfium.wasm', {
    encoderPoolSize: 2, // Creates 2 encoder workers
  });
  ```

  - Offloads `OffscreenCanvas.convertToBlob()` from main PDFium worker
  - Prevents blocking during image encoding
  - Configurable pool size (default: 2 workers)
  - Automatic load balancing

  ### 3. Task Queue System

  New `WorkerTaskQueue` with:
  - Priority levels: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
  - Visibility-based ranking for render tasks
  - Automatic task deduplication
  - Graceful cancellation

  ### 4. CompoundTask for Multi-Page Operations

  New `CompoundTask` class for aggregating results:

  ```typescript
  // Automatic progress tracking
  const task = engine.searchAllPages(doc, 'keyword');
  task.onProgress((progress) => {
    console.log(`Page ${progress.page} complete`);
  });
  ```

  - `CompoundTask.gather()` - Like `Promise.all()` with progress
  - `CompoundTask.gatherIndexed()` - Returns `Record<number, Result>`
  - `CompoundTask.first()` - Like `Promise.race()`
  - Automatic child task cleanup

  ## API Additions

  ### Models Package
  - `CompoundTask` - Multi-task aggregation with progress
  - `ImageConversionTypes` type refinements
  - `PdfAnnotationsProgress.result` (renamed from `annotations`)

  ### Engines Package

  New exports:
  - `PdfEngine` - Main orchestrator class
  - `RemoteExecutor` - Worker communication proxy
  - `ImageEncoderWorkerPool` - Image encoding pool
  - `WorkerTaskQueue` - Priority-based queue
  - `PdfiumNative` - Renamed from `PdfiumEngine`

  New image converters:
  - `browserImageDataToBlobConverter` - Legacy converter
  - `createWorkerPoolImageConverter()` - Pool-based converter
  - `createHybridImageConverter()` - Fallback support

  ### Plugin-Render Package

  New config options:

  ```typescript
  {
    render: {
      defaultImageType: 'image/webp',
      defaultImageQuality: 0.92
    }
  }
  ```

  ## Improvements
  - **Performance**: Parallel image encoding improves render throughput by ~40-60%
  - **Responsiveness**: Priority queues ensure visible pages render first
  - **Memory**: Better cleanup of completed tasks and worker references
  - **Logging**: Enhanced performance logging with duration tracking
  - **Developer Experience**: Clearer separation of concerns

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Minor Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  Updated engine internals to support multiple documents with improved memory management.

  ### Changes
  - **Memory Management**: Enhanced memory tracking through `MemoryManager` for proper cleanup of multiple document instances.
  - **Cache**: `PdfCache` now properly tracks and manages multiple document contexts with improved memory management through the memory manager.

  ### Technical Details
  - Document contexts now use `MemoryManager` for proper WASM pointer tracking and cleanup
  - Improved resource management for concurrent document handling

## 1.5.0

### Minor Changes

- [#238](https://github.com/embedpdf/embed-pdf-viewer/pull/238) by [@0xbe7a](https://github.com/0xbe7a) – Add optional **form widget rendering** to the render pipeline.

  ### What changed
  - **@embedpdf/models**
    - `PdfRenderPageOptions` now supports `withForms?: boolean` to request drawing interactive form widgets.

  - **@embedpdf/engines**
    - `PdfiumEngine.renderPage` and `renderPageRect` honor `withForms`.
      When enabled, the engine initializes the page form handle and calls `FPDF_FFLDraw` with the correct device transform.
    - New helper `computeFormDrawParams(matrix, rect, pageSize, rotation)` calculates start offsets and sizes for `FPDF_FFLDraw`.

  - **@embedpdf/plugin-render**
    - New plugin config flags:
      - `withForms?: boolean` (default `false`)
      - `withAnnotations?: boolean` (default `false`)
    - The plugin merges per-call options with plugin defaults so callers can set once at init or override per call.

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `usePdfiumEngine` hook to return a reactive `$state` object directly, simplifying state management for consumers.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with `PdfEngineProvider` component and Rune-based hooks (`useEngineContext`, `useEngine`, `usePdfiumEngine`). Removed deprecated mock engine. Thanks to @andrewrisse!

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

### Patch Changes

- [`3409705`](https://github.com/embedpdf/embed-pdf-viewer/commit/3409705a52afd5fb34a0cdca3e6d5634000f2adb) by [@bobsingor](https://github.com/bobsingor) – Fix stamp scaling issue

## 1.3.3

### Patch Changes

- [#183](https://github.com/embedpdf/embed-pdf-viewer/pull/183) by [@bobsingor](https://github.com/bobsingor) – Fix issues with redaction and annotation on a page that is fixed rotated

## 1.3.2

## 1.3.1

### Patch Changes

- [#175](https://github.com/embedpdf/embed-pdf-viewer/pull/175) by [@bobsingor](https://github.com/bobsingor) – add addAttachment and removeAttachment functions to pdfium and the engine

## 1.3.0

### Patch Changes

- [#170](https://github.com/embedpdf/embed-pdf-viewer/pull/170) by [@bobsingor](https://github.com/bobsingor) – Add ability to setBookmarks and deleteBookmarks

## 1.2.1

## 1.2.0

### Patch Changes

- [#150](https://github.com/embedpdf/embed-pdf-viewer/pull/150) by [@bobsingor](https://github.com/bobsingor) – Add ability to get the language from the root, add function to PDFium EPDFCatalog_GetLanguage

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Add new function to PDFium EPDFAnnot_UpdateAppearanceToRect to be able to update the appearance stream on resize of the stamp image annotation

## 1.1.1

## 1.1.0

### Patch Changes

- [#137](https://github.com/embedpdf/embed-pdf-viewer/pull/137) by [@bobsingor](https://github.com/bobsingor) – Add engine context provider to React and Vue

## 1.0.26

### Patch Changes

- [#132](https://github.com/embedpdf/embed-pdf-viewer/pull/132) by [@bobsingor](https://github.com/bobsingor) – Update PDF meta data to include trapped and custom values

## 1.0.25

### Patch Changes

- [`b741036`](https://github.com/embedpdf/embed-pdf-viewer/commit/b7410368e5bbe00dca339c9c31b380e913d4e52c) by [@bobsingor](https://github.com/bobsingor) – Export DEFAULT_PDFIUM_WASM_URL for easy way to get the PDFium URL

## 1.0.24

### Patch Changes

- [#127](https://github.com/embedpdf/embed-pdf-viewer/pull/127) by [@bobsingor](https://github.com/bobsingor) – Add yield function to check for abortions before executing

- [#127](https://github.com/embedpdf/embed-pdf-viewer/pull/127) by [@bobsingor](https://github.com/bobsingor) – Add Memory Manager to the engine for better memory safety

## 1.0.23

### Patch Changes

- [#125](https://github.com/embedpdf/embed-pdf-viewer/pull/125) by [@bobsingor](https://github.com/bobsingor) – Add fallback if offscreen canvas is not supported (this will solve #50)

## 1.0.22

## 1.0.21

### Patch Changes

- [#118](https://github.com/embedpdf/embed-pdf-viewer/pull/118) by [@bobsingor](https://github.com/bobsingor) – Add the option to setMetadata for a PDF document

- [#115](https://github.com/embedpdf/embed-pdf-viewer/pull/115) by [@bobsingor](https://github.com/bobsingor) – Fix attachment issue

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add function EPDFPage_RemoveAnnotRaw so that we cheaply can remove an annotation

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Properly save annotation flags

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add preparePrintDocument function to the engine

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Support for redactions (properly redact, remove text objects, remove parts of images and paths)

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add posibility for progress on Task

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add new function EPDFPage_GetAnnotCountRaw and EPDFPage_GetAnnotRaw to increase speed of annotations

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add support for comments on annotations

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Ability to stream search results for better experience on large documents

## 1.0.16

## 1.0.15

### Patch Changes

- [#54](https://github.com/embedpdf/embed-pdf-viewer/pull/54) by [@bobsingor](https://github.com/bobsingor) – Add support for image stamp

## 1.0.14

### Patch Changes

- [#52](https://github.com/embedpdf/embed-pdf-viewer/pull/52) by [@bobsingor](https://github.com/bobsingor) – Add support for (basic) free text annotation

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add support for polygon, polyline, line, arrow line annotations

- [#49](https://github.com/embedpdf/embed-pdf-viewer/pull/49) by [@bobsingor](https://github.com/bobsingor) – Add support for square and circle annotations

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update engines to have shared code between react and preact to simplify workflow

- [#46](https://github.com/embedpdf/embed-pdf-viewer/pull/46) by [@bobsingor](https://github.com/bobsingor) – Ability to generate AP stream with blend mode and show blendmode in annotations

## 1.0.11

## 1.0.10

## 1.0.9

### Patch Changes

- [`d4c602c`](https://github.com/embedpdf/embed-pdf-viewer/commit/d4c602cf2045ee06eec56ec794d5f4dbb4613131) by [@bobsingor](https://github.com/bobsingor) – Make config of the usePdfiumEngine completely optional

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

### Patch Changes

- [#35](https://github.com/embedpdf/embed-pdf-viewer/pull/35) by [@bobsingor](https://github.com/bobsingor) – Text markup annotation support (Highlight, Underline, Strikeout, Squiggle)

## 1.0.6

### Patch Changes

- [#29](https://github.com/embedpdf/embed-pdf-viewer/pull/29) by [@bobsingor](https://github.com/bobsingor) – Improve text selection and add ability to get text for a specific selection

## 1.0.5

### Patch Changes

- [#28](https://github.com/embedpdf/embed-pdf-viewer/pull/28) by [@bobsingor](https://github.com/bobsingor) – Ability to capture a part of the PDF and save it to image

## 1.0.4

### Patch Changes

- [#24](https://github.com/embedpdf/embed-pdf-viewer/pull/24) by [@bobsingor](https://github.com/bobsingor) – Move PDF engine hook to the engine package for consistency

## 1.0.3

### Patch Changes

- [#21](https://github.com/embedpdf/embed-pdf-viewer/pull/21) by [@bobsingor](https://github.com/bobsingor) – Expose all PDFium functions

## 1.0.2

## 1.0.1
