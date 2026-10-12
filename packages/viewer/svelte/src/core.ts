/**
 * @embedpdf/viewer-svelte/core — the engine-agnostic Svelte door.
 *
 * ```svelte
 * <script lang="ts">
 *   import { PDFViewer } from '@embedpdf/viewer-svelte/core';
 *   import { cloudEngine } from '@cloudpdf/engine';
 * </script>
 *
 * <PDFViewer engine={() => cloudEngine({ baseUrl, token })} {documents} />
 * ```
 *
 * The same `<PDFViewer>` as the main entry, but with no default engine: `engine` is required, and
 * takes only a real implementation (an `Engine`, or a function the viewer owns the lifetime of).
 * In exchange the local PDFium engine (wasm, worker source, main-thread recipe) never enters your
 * module graph: nothing is stubbed or aliased away, it is not imported. Its options are absent
 * from the type for the same reason: there is no built-in engine here for `{ assetsUrl }` to
 * configure.
 *
 * App code that wants the batteries-included viewer imports `@embedpdf/viewer-svelte`; this entry
 * is for builds that always give their own engine, and is what the CloudPDF Svelte wrapper is
 * built on.
 */
import '@embedpdf/viewer/core';

import type { ViewerConfig } from '@embedpdf/viewer/core';
import type { Component } from 'svelte';

import PDFViewerImpl from './component.svelte';
import type { PDFViewerPropsOf } from './props';

export * from '@embedpdf/viewer/core';
export type { PDFViewerExtras, PDFViewerPropsOf } from './props';
export { useCommand, usePDFViewer } from './hooks';
export { Panel, Region, ToolbarItem, useToolbarItem } from './slots';
export type { PanelProps, RegionName, RegionProps, ToolbarItemProps } from './slots';
export { Button, Menu, MenuItem } from './viewer-components';
export type { ButtonProps, MenuItemProps, MenuProps } from './viewer-components';

/** Props on this door: `engine` is required, and only a real engine satisfies it. */
export type PDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/** The shared component, narrowed to this door's config: the wider props type assigns to it. */
export const PDFViewer: Component<PDFViewerProps, {}, 'element'> = PDFViewerImpl;
