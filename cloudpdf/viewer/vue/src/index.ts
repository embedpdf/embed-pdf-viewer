/**
 * @cloudpdf/viewer-vue — the full viewer as a Vue component, with the CloudPDF engine as the
 * default: the same `<PDFViewer>` as `@embedpdf/viewer-vue`, whose documents live on your
 * CloudPDF.
 *
 * ```vue
 * <script setup lang="ts">
 * import { PDFViewer } from '@cloudpdf/viewer-vue';
 *
 * defineProps<{ token: string }>();
 * </script>
 *
 * <template>
 *   <PDFViewer :src="{ token }" style="height: 100vh" />
 * </template>
 * ```
 *
 * A door like the open viewer's two (docs/conventions/viewer-doors.md): it imports the cloud
 * door, which registers the cloud engine on `<embedpdf-viewer>`, re-exports the wrapper's parts,
 * and defines `<PDFViewer>` with the cloud's `ViewerConfig` as its props. `engine` takes the
 * cloud engine's settings (`baseUrl`, CloudPDF SaaS when left out), `src` a document token, an id
 * or a share link.
 */
import '@cloudpdf/viewer';

import type { ViewerConfig } from '@cloudpdf/viewer';
import {
  PDF_VIEWER_OPTIONS,
  setupPDFViewer,
  type PDFViewerComponent,
  type PDFViewerEmits,
  type PDFViewerPropsOf,
  type PDFViewerSlots,
} from '@embedpdf/viewer-vue/component';
import { defineComponent } from 'vue';

export * from '@cloudpdf/viewer';
export * from '@embedpdf/viewer-vue/component';

export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/**
 * The full viewer. The shared setup takes the widest config, so it serves this door's narrower
 * props as they are; the type adds what a template ref reads (`elementRef`).
 */
export const PDFViewer = defineComponent<PDFViewerProps, PDFViewerEmits, string, PDFViewerSlots>(
  setupPDFViewer,
  PDF_VIEWER_OPTIONS,
) as PDFViewerComponent<PDFViewerProps>;
