'use client';

import type { LocalEngine } from '@embedpdf/engine';
import { PDFViewer, type Viewer } from '@embedpdf/viewer-react';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';

import { toolEngine } from './engine';

type ViewerStrings = ComponentProps<typeof PDFViewer>['strings'];

/** Open `panel` once the document is: the panels belong to an open document, and the viewer is ready before the file is. */
function openPanel(viewer: Viewer, panel: string) {
  const stop = viewer.watch(
    () => viewer.tryGet('shell'),
    (shell) => {
      if (!shell) return;
      shell.open(panel);
      stop();
    },
  );
}

/**
 * A file in the EmbedPDF viewer, for the tools whose work is the viewer's: one panel open, the
 * features the tool doesn't need turned off, and the viewer's words changed where the tool says
 * it differently. The viewer borrows the tools' engine. Its own Download is always off: the
 * tool's button keeps the file's name, and `onViewer` hands it the viewer to download from.
 */
export function ToolViewer({
  name,
  bytes,
  password,
  disable,
  panel,
  strings,
  onViewer,
}: {
  name: string;
  bytes: Uint8Array;
  password?: string;
  disable: readonly string[];
  panel: string;
  strings?: ViewerStrings;
  onViewer: (viewer: Viewer) => void;
}) {
  // The tool already started the engine, so this resolves at once.
  const [engine, setEngine] = useState<LocalEngine | null>(null);
  useEffect(() => {
    void toolEngine().then(setEngine);
  }, []);
  const documents = useMemo(
    () => [
      {
        src: new File([bytes as BlobPart], name, { type: 'application/pdf' }),
        name,
        ...(password ? { password } : {}),
      },
    ],
    [bytes, name, password],
  );
  const off = useMemo(
    () => [...disable, 'documents.download', 'documents.open', 'documents.tabs'],
    [disable],
  );
  if (!engine) return null;
  return (
    <PDFViewer
      documents={documents}
      engine={engine}
      theme="light"
      disable={off}
      strings={strings}
      onReady={(viewer) => {
        openPanel(viewer, panel);
        onViewer(viewer);
      }}
      style={{ display: 'block', height: '100%', width: '100%' }}
    />
  );
}
