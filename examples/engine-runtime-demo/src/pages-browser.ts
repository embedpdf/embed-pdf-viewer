import { createLocalEngineWithWorker } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';
import { runPagesDemo, summarizePages } from './pages-demo.ts';

const out = document.getElementById('out');
if (!out) throw new Error('out element not found');

try {
  const worker = new EngineWorker();
  const engine = await createLocalEngineWithWorker({ worker });
  // sample.pdf is multi-page; the reorder demo needs at least 2 pages.
  const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());

  const result = await runPagesDemo(
    'local (browser, wasm in worker)',
    engine,
    bytes,
    'pages-demo-browser',
  );

  out.textContent = JSON.stringify(summarizePages(result), null, 2);
  await engine.destroy();
} catch (e) {
  out.textContent = 'Error: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e));
}
