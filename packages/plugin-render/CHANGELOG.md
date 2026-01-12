# @embedpdf/plugin-render

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The render plugin now supports rendering pages from multiple documents.

  ### Breaking Changes
  - **Constructor**: Plugin constructor now accepts optional `config` parameter. Configuration is applied during construction instead of via `initialize()` method.
  - **Removed `onRefreshPages`**: The `onRefreshPages()` method has been removed. Page refresh tracking is now handled in core `DocumentState.pageRefreshVersions`, allowing any plugin to observe page refreshes.
  - **Render Methods**: `renderPage()` and `renderPageRect()` now accept an optional `documentId` parameter. If not provided, they operate on the active document.
  - **Error Messages**: Error messages now include document ID for better debugging.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **RenderLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-render/react`, Svelte: `@embedpdf/plugin-render/svelte`, Vue: `@embedpdf/plugin-render/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Removed deprecated `scaleFactor` prop
    - `dpr` prop is now optional - if not provided, uses `window.devicePixelRatio`
    - Component now uses `useDocumentState` hook to get document scale and refresh version automatically

  ### New Features
  - `forDocument(documentId)` method returns `RenderScope` for document-specific rendering operations
  - Support for rendering pages from any document, not just the active one
  - Simplified architecture with refresh tracking moved to core state

### Minor Changes

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

## 2.0.0-next.3

### Minor Changes

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

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The render plugin now supports rendering pages from multiple documents.

  ### Breaking Changes
  - **Constructor**: Plugin constructor now accepts optional `config` parameter. Configuration is applied during construction instead of via `initialize()` method.
  - **Removed `onRefreshPages`**: The `onRefreshPages()` method has been removed. Page refresh tracking is now handled in core `DocumentState.pageRefreshVersions`, allowing any plugin to observe page refreshes.
  - **Render Methods**: `renderPage()` and `renderPageRect()` now accept an optional `documentId` parameter. If not provided, they operate on the active document.
  - **Error Messages**: Error messages now include document ID for better debugging.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **RenderLayer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-render/react`, Svelte: `@embedpdf/plugin-render/svelte`, Vue: `@embedpdf/plugin-render/vue`)
    - `scale` prop is now optional - if not provided, uses document state scale
    - Removed deprecated `scaleFactor` prop
    - `dpr` prop is now optional - if not provided, uses `window.devicePixelRatio`
    - Component now uses `useDocumentState` hook to get document scale and refresh version automatically

  ### New Features
  - `forDocument(documentId)` method returns `RenderScope` for document-specific rendering operations
  - Support for rendering pages from any document, not just the active one
  - Simplified architecture with refresh tracking moved to core state

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

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useRenderPlugin`, `useRenderCapability`) and `RenderLayer.svelte` component. Thanks to @andrewrisse for implementing the Svelte render layer!

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

### Patch Changes

- [#209](https://github.com/embedpdf/embed-pdf-viewer/pull/209) by [@bobsingor](https://github.com/bobsingor) – Refactor Vue render-layer to improve image URL management

## 1.3.12

### Patch Changes

- [#204](https://github.com/embedpdf/embed-pdf-viewer/pull/204) by [@bobsingor](https://github.com/bobsingor) – Fix refresh not working on Vue component after redaction

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Add `scale` prop and deprecate `scaleFactor` in `RenderLayer` (React & Vue).
  - New `scale` prop is now the preferred way to control render scale.
  - `scaleFactor` remains supported but is **deprecated** and will be removed in the next major release.
  - Internally both implementations resolve `actualScale = scale ?? scaleFactor ?? 1` and pass it to the renderer.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Ability to refresh a page and cause rerender (necessary for redaction)

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add Vue package to render plugin

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update render plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

### Patch Changes

- [`f629db4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f629db47e1a2693e913defbc1a9e76912af945e3) by [@bobsingor](https://github.com/bobsingor) – Some small bugfixes, in some cases interactionmanager state can be null and gives error on fast reload, add get state to selection manager for debugging purposes and make @embedpdf/model a dependency of scroll to make sure it doesn't get add inline inside the component

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

### Patch Changes

- [#28](https://github.com/embedpdf/embed-pdf-viewer/pull/28) by [@bobsingor](https://github.com/bobsingor) – Ability to capture a part of the PDF and save it to image

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
