/**
 * The props of `<PDFViewer>`: every key of the viewer's config, its callbacks under their Svelte
 * names, and what places it on your page. Types only from the viewer, as in `./component.svelte`:
 * this module is shared by both doors.
 */
import type {
  ElementConfig,
  EmbedPdfViewerElement,
  PanelResizeEvent,
  Viewer,
} from '@embedpdf/viewer/core';
import type { Snippet } from 'svelte';

/** The framework-side props: everything that is not viewer config. */
export interface PDFViewerExtras {
  class?: string;
  style?: string;
  /** Your components, shown where their slot says: `<ToolbarItem>`, `<Panel>`, `<Region>`. */
  children?: Snippet;
  /** The `<embedpdf-viewer>` element, for its imperative surface: `bind:element`. */
  element?: EmbedPdfViewerElement | null;
  /**
   * Called with the `viewer` once it's live, before any document has opened: capabilities
   * resolve from then on, and document-scoped calls wait for their document.
   */
  onready?: (viewer: Viewer) => void;
  /**
   * Called with the active document's id whenever it changes: the first document that opens, a
   * switch to another tab, and `null` once the last one closes.
   */
  ondocumentchange?: (documentId: string | null) => void;
  /**
   * Called when the user has resized a panel, with its id and new width in px: once a drag of its
   * edge ends, and on each arrow key there.
   */
  onpanelresize?: (event: PanelResizeEvent) => void;
}

/** The config's callbacks, which `<PDFViewer>` takes under their Svelte names. */
type ConfigCallback = 'onReady' | 'onDocumentChange' | 'onPanelResize';

/**
 * The props of `<PDFViewer>` for a door whose config is `Config`: each key of the config is a prop,
 * except its callbacks, which are `onready`, `ondocumentchange` and `onpanelresize` here, with
 * `class`, `style`, `children` and `element` next to them.
 */
export type PDFViewerPropsOf<Config extends object> = Omit<Config, ConfigCallback> &
  PDFViewerExtras;

/**
 * Props for the shared implementation. Each entry re-exports `<PDFViewer>` narrowed to its door's
 * config: `PDFViewerProps` in `./index.ts` (engine optional) and `./core.ts` (engine required).
 */
export type PDFViewerImplProps = PDFViewerPropsOf<ElementConfig>;
