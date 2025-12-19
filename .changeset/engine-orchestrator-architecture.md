---
'@embedpdf/engines': major
'@embedpdf/models': minor
'@embedpdf/plugin-render': minor
---

# Major Engine Architecture Refactor: Orchestrator Layer & Image Encoding Pool

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
