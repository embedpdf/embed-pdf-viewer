// Consumer archetype: bundler production build. Mirrors the real app wiring —
// including the `?worker` import of the raw-TS worker entry, which only works
// if the TS source actually shipped in the tarball (epdf.rawExports + files).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from '@embedpdf/react/runtime';
import type { Engine } from '@embedpdf/react/runtime';
import { stagePlugin } from '@embedpdf/react/stage';
import { renderPlugin } from '@embedpdf/react/render';
import EmbedPDF from '@embedpdf/viewer';
import { PDFViewer } from '@embedpdf/viewer-react';
import CloudPDF from '@cloudpdf/viewer';
import { CloudPDFViewer } from '@cloudpdf/viewer-react';

async function createEngine(): Promise<Engine> {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
  return createLocalEngineWithWorker({ worker: new EngineWorker() });
}

// Reference everything so nothing tree-shakes away; the check is `vite build`.
(globalThis as Record<string, unknown>).__epdfFixture = {
  createEngine,
  EmbedPDF,
  PDFViewer,
  CloudPDF,
  CloudPDFViewer,
  mount: () =>
    createRoot(document.getElementById('root')!).render(
      createElement('div', null, typeof Viewer, typeof stagePlugin, typeof renderPlugin),
    ),
};
