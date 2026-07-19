// Consumer archetype: bundler production build. Mirrors the real app wiring —
// including the `?worker` import of the raw-TS worker entry, which only works
// if the TS source actually shipped in the tarball (epdf.rawExports + files).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from '@embedpdf-x/react/runtime';
import type { Engine } from '@embedpdf-x/react/runtime';
import { stagePlugin } from '@embedpdf-x/react/stage';
import { renderPlugin } from '@embedpdf-x/react/render';

async function createEngine(): Promise<Engine> {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
  return createLocalEngineWithWorker({ worker: new EngineWorker() });
}

// Reference everything so nothing tree-shakes away; the check is `vite build`.
(globalThis as Record<string, unknown>).__epdfFixture = {
  createEngine,
  mount: () =>
    createRoot(document.getElementById('root')!).render(
      createElement('div', null, typeof Viewer, typeof stagePlugin, typeof renderPlugin),
    ),
};
