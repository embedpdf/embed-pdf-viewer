import { createLocalEngineWithWorker } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';
import { runMutationsDemo, summarizeMutations } from './mutations-demo.ts';

const TEST_PAGE = 3;

const out = document.getElementById('out');
if (!out) throw new Error('out element not found');

try {
  const worker = new EngineWorker();
  const engine = await createLocalEngineWithWorker({ worker });
  const bytes = new Uint8Array(await (await fetch('/annotations.pdf')).arrayBuffer());

  const result = await runMutationsDemo(
    'local (browser, wasm in worker)',
    engine,
    bytes,
    TEST_PAGE,
    'mutations-demo-browser',
  );

  out.textContent = JSON.stringify(summarizeMutations(result), null, 2);
  await engine.destroy();
} catch (e) {
  out.textContent = 'Error: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e));
}
