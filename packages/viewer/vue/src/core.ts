/**
 * @embedpdf/viewer-vue/core: the engine-agnostic Vue door.
 *
 * ```vue
 * <script setup lang="ts">
 * import { PDFViewer } from '@embedpdf/viewer-vue/core';
 * import { cloudEngine } from '@cloudpdf/engine';
 *
 * const engine = () => cloudEngine({ baseUrl, token });
 * </script>
 *
 * <template>
 *   <PDFViewer :engine="engine" :documents="docs" />
 * </template>
 * ```
 *
 * The same <PDFViewer> as the main entry, but with no default engine, so
 * `engine` is required and takes only a real implementation (an `Engine`, or a
 * factory the viewer owns the lifetime of). In exchange the local PDFium engine
 * (wasm, worker source, main-thread recipe) never enters your module graph:
 * nothing is stubbed or aliased away, it is not imported. Its options bag is
 * absent from the type for the same reason (there is no built-in engine here
 * for `{ assetsUrl }` to configure).
 *
 * App code that wants the batteries-included viewer imports
 * `@embedpdf/viewer-vue`; this entry is for builds that always pass their own
 * engine, and is what the CloudPDF Vue wrapper is built on.
 */
import '@embedpdf/viewer/core';

import type { ViewerConfig } from '@embedpdf/viewer/core';
import { defineComponent } from 'vue';

import {
  PDF_VIEWER_OPTIONS,
  setupPDFViewer,
  type PDFViewerComponent,
  type PDFViewerEmits,
  type PDFViewerPropsOf,
  type PDFViewerSlots,
} from './component';

export * from '@embedpdf/viewer/core';
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

/** Props on this door: `engine` is required, and only a real engine satisfies it. */
export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/**
 * The full viewer. The shared setup takes the widest config, so it serves this door's narrower
 * props as they are; the type adds what a template ref reads (`elementRef`).
 */
export const PDFViewer = defineComponent<PDFViewerProps, PDFViewerEmits, string, PDFViewerSlots>(
  setupPDFViewer,
  PDF_VIEWER_OPTIONS,
) as PDFViewerComponent<PDFViewerProps>;
