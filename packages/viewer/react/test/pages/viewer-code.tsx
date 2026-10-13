/**
 * The viewer in code, from React: `usePDFViewer()` and `useCommand()` in a component inside
 * <PDFViewer>, a headless hook next to them, `onReady` and the element's ref outside it, the
 * `plugins` config with a plugin of the app's own, and the viewer being done once <PDFViewer>
 * unmounts. `viewer-code.test.ts` drives it.
 */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStageState } from '@embedpdf/react/stage';
import { PDFViewer, useCommand, usePDFViewer } from '@embedpdf/viewer-react';
import type { EmbedPdfViewerElement, Viewer } from '@embedpdf/viewer-react';

import { checkRecord } from './check';

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
  /** Every viewer `onReady` gave, in order. */
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
let mounts = 0;

/** A plugin of the app's own, as a headless app writes one. */
const analyticsPlugin = (config: { endpoint: string }) => ({
  id: 'acme-analytics',
  token: { name: 'analytics' },
  create: () => ({
    api: { track: (name: string) => record.tracked.push(`${config.endpoint} ${name}`) },
  }),
});

const PLUGINS = {
  stage: { spread: 'odd' as const },
  analytics: analyticsPlugin({ endpoint: '/api/events' }),
};

function Inside() {
  const viewer = usePDFViewer();
  const zoomIn = useCommand('zoom:in');
  const pan = useCommand('tool:pan');
  const missing = useCommand('acme:missing');
  const { zoomLevel } = useStageState();
  const [mount] = useState(() => ++mounts);
  record.inside = { viewer, zoomLevel, zoomIn, pan, missing, mounts: mount };
  return null;
}

function Outside() {
  try {
    usePDFViewer();
    record.outside = 'no error';
  } catch (error) {
    record.outside = (error as Error).message;
  }
  return null;
}

function onReady(viewer: Viewer) {
  const index = record.viewers.push(viewer) - 1;
  viewer.documents.onClosed(({ documentId }) => record.heard.push(`${index} closed ${documentId}`));
}

function App() {
  const [shown, setShown] = useState(true);
  const elementRef = useRef<EmbedPdfViewerElement | null>(null);
  record.element = () => elementRef.current;
  record.show = setShown;
  return (
    <>
      <Outside />
      {shown && (
        <PDFViewer
          src="/sample.pdf"
          plugins={PLUGINS}
          onReady={onReady}
          elementRef={elementRef}
          className="report-viewer"
          style={{ height: '100vh', display: 'block' }}
        >
          <Inside />
        </PDFViewer>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
