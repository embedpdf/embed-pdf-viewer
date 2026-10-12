/**
 * @embedpdf/viewer-vue: the full viewer as a Vue component, with the built-in
 * local engine (PDFium wasm in a worker) as the default.
 *
 * ```vue
 * <script setup lang="ts">
 * import { PDFViewer } from '@embedpdf/viewer-vue';
 * </script>
 *
 * <template>
 *   <PDFViewer src="/report.pdf" style="height: 100vh" />
 * </template>
 * ```
 *
 * Zero config: no `engine` prop, no bundler setup. This is the door app code
 * should use. Builds that always pass their own engine (a cloud deployment, a
 * self-hosted `@cloudpdf/server`) import `@embedpdf/viewer-vue/core` instead,
 * which is the same component with PDFium not in the module graph.
 *
 * The component's setup lives in `./component` and is engine-blind; the one
 * import below is what makes this entry the local-engine door.
 */
import '@embedpdf/viewer';

import type { ViewerConfig } from '@embedpdf/viewer';
import { defineComponent } from 'vue';

import {
  PDF_VIEWER_OPTIONS,
  setupPDFViewer,
  type PDFViewerComponent,
  type PDFViewerEmits,
  type PDFViewerPropsOf,
  type PDFViewerSlots,
} from './component';

// The whole customization vocabulary (plus the local engine's config types)
// rides along, so apps import one package.
export * from '@embedpdf/viewer';
export type {
  PDFViewerComponent,
  PDFViewerEmits,
  PDFViewerExposed,
  PDFViewerPropsOf,
  PDFViewerSlots,
} from './component';
export { useCommand, usePDFViewer } from './composables';
export { Panel, Region, ToolbarItem, useToolbarItem } from './slots';
export type { PanelProps, RegionName, RegionProps, ToolbarItemProps } from './slots';
export { Button, Menu, MenuItem } from './viewer-components';
export type { ButtonProps, MenuItemProps, MenuProps } from './viewer-components';

/**
 * Props on this door: `engine` is optional. Leave it out for the built-in local engine (zero
 * bundler config; your bundler ships `embedpdf.wasm` inside your own build, sibling-first with a
 * pinned-CDN fetch-failure fallback), or pass its options bag (`{ wasmUrl }` / `{ assetsUrl }` /
 * worker URLs for strict CSP).
 */
export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/**
 * The full viewer. The shared setup takes the widest config, so it serves this door's narrower
 * props as they are; the type adds what a template ref reads (`elementRef`).
 */
export const PDFViewer = defineComponent<PDFViewerProps, PDFViewerEmits, string, PDFViewerSlots>(
  setupPDFViewer,
  PDF_VIEWER_OPTIONS,
) as PDFViewerComponent<PDFViewerProps>;
