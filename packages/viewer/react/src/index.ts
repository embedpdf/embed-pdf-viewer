/**
 * @embedpdf/viewer-react — the full viewer as a React component, with the
 * built-in LOCAL engine (PDFium wasm in a worker) as the default.
 *
 * ```tsx
 * import { PDFViewer } from '@embedpdf/viewer-react';
 *
 * <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />
 * ```
 *
 * Zero config: no `engine` prop, no bundler setup. This is the door app code
 * should use. Builds that always inject their own engine — a cloud deployment,
 * a self-hosted `@cloudpdf/server` — import `@embedpdf/viewer-react/core`
 * instead, which is the same component with PDFium structurally absent.
 *
 * The component itself lives in `./component` and is engine-blind; the one
 * import below is what makes THIS entry the local-engine door.
 */
import '@embedpdf/viewer';

import type { ViewerConfig } from '@embedpdf/viewer';

import type { PDFViewerExtras } from './component';

// The whole customization vocabulary (plus the LOCAL engine's config types)
// rides along, so apps import ONE package.
export * from '@embedpdf/viewer';
export { PDFViewer } from './component';
export type { PDFViewerExtras } from './component';

/**
 * Props on THIS door: `engine` is OPTIONAL — omit it for the built-in local
 * engine (zero bundler config; your bundler ships `pdfium.wasm` inside your own
 * build, sibling-first with a pinned-CDN fetch-failure fallback), or pass its
 * options bag (`{ wasmUrl }` / `{ assetsUrl }` / worker URLs for strict CSP).
 */
export type PDFViewerProps = ViewerConfig & PDFViewerExtras;
