/**
 * @embedpdf/viewer-svelte — the full viewer as a Svelte component, with the built-in local engine
 * (PDFium wasm in a worker) as the default.
 *
 * ```svelte
 * <script lang="ts">
 *   import { PDFViewer } from '@embedpdf/viewer-svelte';
 * </script>
 *
 * <PDFViewer src="/report.pdf" style="height: 100vh" />
 * ```
 *
 * Zero config: no `engine` prop, no bundler setup. This is the door app code should use. Builds
 * that always give their own engine (a cloud deployment, a self-hosted `@cloudpdf/server`) import
 * `@embedpdf/viewer-svelte/core` instead, which is the same component with PDFium absent.
 *
 * The component itself lives in `./component.svelte` and is engine-blind; the one import below is
 * what makes this entry the local-engine door.
 */
import '@embedpdf/viewer';

import type { ViewerConfig } from '@embedpdf/viewer';
import type { Component } from 'svelte';

import { PDFViewer as PDFViewerImpl, type PDFViewerPropsOf } from './parts';

export * from '@embedpdf/viewer';
export * from './parts';

export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/** The shared component, narrowed to this door's config: the wider props type assigns to it. */
export const PDFViewer: Component<PDFViewerProps, {}, 'element'> = PDFViewerImpl;
