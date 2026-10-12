/**
 * The viewer in code, from Svelte: `usePDFViewer()` and `useCommand()` in a component inside
 * <PDFViewer>, a headless function next to them, `onready` and the bound element outside it, the
 * `plugins` config with a plugin of the app's own, and the viewer being done once <PDFViewer>
 * unmounts (`ViewerCode.svelte`). `viewer-code.test.ts` drives it.
 */
import type { EmbedPdfViewerElement, Viewer } from '@embedpdf/viewer-svelte';
import { mount } from 'svelte';

import { checkRecord } from './check';
import ViewerCode from './ViewerCode.svelte';

/** What a component inside the viewer saw last. */
export interface Inside {
  viewer: Viewer;
  zoomLevel: number;
  zoomIn: { label: string; enabled: boolean };
  pan: { active: boolean; run: () => Promise<unknown> };
  missing: { label: string; enabled: boolean };
  /** How many times a component inside has mounted: once per viewer. */
  mounts: number;
}

export interface ViewerCodeRecord {
  /** Every viewer `onready` gave, in order. */
  readonly viewers: Viewer[];
  /** What each viewer's `documents.onClosed` heard, as `<viewer index> closed <id>`. */
  readonly heard: string[];
  /** What the app's own analytics plugin tracked. */
  readonly tracked: string[];
  inside: Inside | null;
  /** What `usePDFViewer()` did outside <PDFViewer>: its error's message. */
  outside: string | null;
  element(): EmbedPdfViewerElement | null;
  show(shown: boolean): void;
}

const record = checkRecord<ViewerCodeRecord>({
  viewers: [],
  heard: [],
  tracked: [],
  inside: null,
  outside: null,
  element: () => null,
  show: () => {},
});

mount(ViewerCode, { target: document.getElementById('root')!, props: { record } });
