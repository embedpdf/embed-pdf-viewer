import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { runDemo } from './demo.ts';

const out = document.getElementById('out');
if (!out) throw new Error('out element not found');

try {
  const runtime = await createPdfRuntime({ prefer: 'wasm' });
  const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
  const result = await runDemo(runtime, bytes);
  out.textContent = JSON.stringify(result, null, 2);
  await runtime.destroy();
} catch (e) {
  out.textContent = 'Error: ' + (e instanceof Error ? (e.stack ?? e.message) : String(e));
}
