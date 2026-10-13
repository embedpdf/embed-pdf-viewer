/**
 * The viewer in code, from Vue: `usePDFViewer()` and `useCommand()` in a component inside
 * <PDFViewer>, a headless composable next to them, `@ready` and the element through a template
 * ref outside it, the `plugins` config with a plugin of the app's own, and the viewer being done
 * once <PDFViewer> unmounts (`ViewerCodeApp.vue`). `viewer-code.test.ts` drives it.
 */
import type { EmbedPdfViewerElement, Viewer } from '@embedpdf/viewer-vue';
import { createApp } from 'vue';

import { checkRecord } from './check';
import ViewerCodeApp from './ViewerCodeApp.vue';

/** What a component inside the viewer saw on its last render. */
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
  /** Every viewer `@ready` gave, in order. */
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

createApp(ViewerCodeApp, { record }).mount('#root');
