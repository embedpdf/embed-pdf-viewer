'use client';
/**
 * @embedpdf/viewer-react/component — the wrapper's door-blind parts: `<PDFViewer>` at the widest
 * config (the kernel's `ElementConfig`), and the components and hooks every door shares.
 *
 * A door imports its engine's door, re-exports these, and narrows `<PDFViewer>` to its own
 * `ViewerConfig` by assignment: this package's two (`.` with the built-in engine, `./core` with
 * none) and `@cloudpdf/viewer-react` with the cloud engine (docs/conventions/viewer-doors.md).
 */
export { PDFViewer } from './component';
export type { PDFViewerExtras, PDFViewerImplProps } from './component';
export { useCommand, usePDFViewer } from './hooks';
export { Panel, Region, ToolbarItem, useToolbarItem } from './slots';
export type { PanelProps, RegionName, RegionProps, ToolbarItemProps } from './slots';
export { Button, Menu, MenuItem } from './viewer-components';
export type { ButtonProps, MenuItemProps, MenuProps } from './viewer-components';
