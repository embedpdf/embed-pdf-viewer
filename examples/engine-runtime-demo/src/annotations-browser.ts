import { createLocalEngineWithWorker } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';
import { runAnnotationsDemo, summarizeRawAll } from './annotations-demo.ts';

const out = document.getElementById('out');
if (!out) throw new Error('out element not found');

try {
  const worker = new EngineWorker();
  const engine = await createLocalEngineWithWorker({ worker });
  const bytes = new Uint8Array(await (await fetch('/annotations.pdf')).arrayBuffer());
  const result = await runAnnotationsDemo(
    'local (browser, wasm in worker)',
    engine,
    bytes,
    'annotations-pdf',
  );

  const view = {
    label: result.label,
    docId: result.docId,
    elapsedMs: result.elapsedMs,
    summary: summarizeRawAll(result.rawAll),
    pageStateByPon: Object.fromEntries(
      Object.entries(result.fullByPage).map(([pon, page]) => [
        pon,
        {
          pageObjectNumber: page.pageState.pageObjectNumber,
          hasAnyWeakAnnotations:
            page.pageState.weakAnnotationState.kind === 'known'
              ? page.pageState.weakAnnotationState.hasAnyWeakAnnotations
              : null,
          generation: page.pageState.revision.generation,
          count: page.annotations.length,
        },
      ]),
    ),
  };
  out.textContent = JSON.stringify(view, null, 2);
  await engine.destroy();
} catch (e) {
  out.textContent = 'Error: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e));
}
