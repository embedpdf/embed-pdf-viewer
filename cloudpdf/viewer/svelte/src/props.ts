/** The props of `<CloudPDFViewer>`. */
import type { ViewerConfig } from '@cloudpdf/viewer/config';
import type { PDFViewerPropsOf } from '@embedpdf/viewer-svelte/core';

/**
 * The cloud connection and its documents (`src` as `{ token }`, `{ id }` or `{ shareToken }`),
 * plus every viewer option except `engine` (this door supplies it) and `scope` and `identity`
 * (the token carries them), with the callbacks under their Svelte names, as on `<PDFViewer>`.
 */
export type CloudPDFViewerProps = PDFViewerPropsOf<ViewerConfig>;
