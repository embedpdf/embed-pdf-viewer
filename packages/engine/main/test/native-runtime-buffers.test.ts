import { expect, test } from 'vitest';
import { createPdfRuntime } from '@embedpdf/engine-runtime';

// Electron's V8 sandbox forbids external ArrayBuffers (memory V8 does not
// own), so the native addon must hand bytes back in JS-owned buffers. V8 also
// refuses to transfer an external buffer, which makes the difference visible
// in plain Node.
test('native readBytes returns a JS-owned, transferable ArrayBuffer', async () => {
  const runtime = await createPdfRuntime({ prefer: 'native' });
  try {
    const ptr = runtime.mem.alloc(4);
    runtime.mem.writeBytes(ptr, new Uint8Array([1, 2, 3, 4]));
    const bytes = runtime.mem.readBytes(ptr, 4);
    runtime.mem.free(ptr);
    const moved = structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    expect([...new Uint8Array(moved)]).toEqual([1, 2, 3, 4]);
  } finally {
    await runtime.destroy();
  }
});
