/**
 * @cloudpdf/viewer-svelte — the full viewer as a Svelte component, with the CloudPDF engine as
 * the default: the same `<PDFViewer>` as `@embedpdf/viewer-svelte`, whose documents live on your
 * CloudPDF.
 *
 * ```svelte
 * <script lang="ts">
 *   import { PDFViewer } from '@cloudpdf/viewer-svelte';
 * </script>
 *
 * <PDFViewer src={{ token }} style="height: 100vh" />
 * ```
 *
 * A door like the open viewer's two (docs/conventions/viewer-doors.md): it imports the cloud
 * door, which registers the cloud engine on `<embedpdf-viewer>`, re-exports the wrapper's parts,
 * and narrows `<PDFViewer>` to the cloud's `ViewerConfig`. `engine` takes the cloud engine's
 * settings (`baseUrl`, CloudPDF SaaS when left out), `src` a document token, an id or a share link.
 */
import '@cloudpdf/viewer';

import type { ViewerConfig } from '@cloudpdf/viewer';
import {
  PDFViewer as PDFViewerImpl,
  type PDFViewerPropsOf,
} from '@embedpdf/viewer-svelte/component';
import type { Component } from 'svelte';

export * from '@cloudpdf/viewer';
export * from '@embedpdf/viewer-svelte/component';

export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/** The shared component, narrowed to the cloud's config: the wider props type assigns to it. */
export const PDFViewer: Component<PDFViewerProps, {}, 'element'> = PDFViewerImpl;
