/**
 * @cloudpdf/viewer-svelte — the full viewer as a Svelte component, wired to CloudPDF.
 *
 * ```svelte
 * <script lang="ts">
 *   import { CloudPDFViewer } from '@cloudpdf/viewer-svelte';
 * </script>
 *
 * <CloudPDFViewer baseUrl="https://api.cloudpdf.com" src={{ token }} style="height: 100vh" />
 * ```
 *
 * A cloud door over `@embedpdf/viewer-svelte/core`: everything the open viewer takes (`layout`,
 * `commands`, `icons`, `strings`, `theme`, `plugins`, your components as children, `onready`,
 * `usePDFViewer()`) works here unchanged. This package adds the CloudPDF connection and names the
 * documents in the cloud's words (`src` as `{ token }`, `{ id }` or `{ shareToken }`), and leaves
 * out `scope` and `identity`, which the document's token carries.
 */
// The open viewer's whole vocabulary rides along, so a cloud app imports one package.
export * from '@embedpdf/viewer-svelte/core';
export { resolveCloudConfig } from '@cloudpdf/viewer/config';
// The cloud's `ViewerConfig`, in place of the one `export *` brings: one name per door.
export type {
  CloudSource,
  DocumentEntry,
  DocumentSrc,
  ViewerConfig,
} from '@cloudpdf/viewer/config';

export { default as CloudPDFViewer } from './CloudPDFViewer.svelte';
export type { CloudPDFViewerProps } from './props';
