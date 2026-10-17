/**
 * @embedpdf/viewer-vue/component — the wrapper's door-blind parts: the viewer's setup and options
 * at the widest config (the kernel's `ElementConfig`), and the components and composables every
 * door shares.
 *
 * A door imports its engine's door, re-exports these, and defines `<PDFViewer>` from the setup
 * with its own `ViewerConfig` as the props: this package's two (`.` with the built-in engine,
 * `./core` with none) and `@cloudpdf/viewer-vue` with the cloud engine
 * (docs/conventions/viewer-doors.md).
 */
export { PDF_VIEWER_OPTIONS, setupPDFViewer } from './component';
export type {
  PDFViewerComponent,
  PDFViewerEmits,
  PDFViewerExposed,
  PDFViewerImplProps,
  PDFViewerPropsOf,
  PDFViewerSlots,
} from './component';
export { useCommand, usePDFViewer } from './composables';
export { Panel, Region, ToolbarItem, useToolbarItem } from './slots';
export type { PanelProps, RegionName, RegionProps, ToolbarItemProps } from './slots';
export { Button, Menu, MenuItem } from './viewer-components';
export type { ButtonProps, MenuItemProps, MenuProps } from './viewer-components';
