import { createLocalEngine } from '@embedpdf/engine';
import { runEngineDemo } from './engine-demo.ts';

const out = document.getElementById('out');
if (!out) throw new Error('out element not found');

try {
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
  const result = await runEngineDemo('local (browser, wasm)', engine, bytes, 'sample-pdf');
  out.textContent = JSON.stringify(result, null, 2);
  await engine.destroy();
} catch (e) {
  out.textContent = 'Error: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e));
}
