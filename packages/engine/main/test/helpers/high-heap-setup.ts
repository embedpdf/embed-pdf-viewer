/**
 * Runs the suite with the low 2 GiB of every wasm runtime's heap taken, so the
 * engine works only with addresses above 2 GiB: the ones that reach JS as
 * negative i32s. See vitest.high-heap.config.ts.
 */
import { vi } from 'vitest';

vi.mock('@embedpdf/engine-runtime', async (importOriginal) => {
  const runtime = await importOriginal<typeof import('@embedpdf/engine-runtime')>();
  return {
    ...runtime,
    async createPdfRuntime(...args: Parameters<typeof runtime.createPdfRuntime>) {
      const created = await runtime.createPdfRuntime(...args);
      if (created.kind === 'wasm') {
        // Never freed: the rest of the runtime's life allocates above it.
        created.mem.alloc(2 ** 31 + 64 * 2 ** 20);
        const probe = created.mem.alloc(16);
        if (probe < 2n ** 31n) throw new Error(`high heap: an allocation landed at ${probe}`);
        created.mem.free(probe);
      }
      return created;
    },
  };
});
