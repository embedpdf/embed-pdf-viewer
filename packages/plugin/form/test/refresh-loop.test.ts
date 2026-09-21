import { describe, expect, it } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

/**
 * G5: an invalidation that lands while `forms.list()` is already in flight
 * must cause a second read — a snapshot can never settle stale. Proven
 * through the real kernel: the fake engine hands out reads it resolves by hand.
 */
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: {
    media: { left: 0, bottom: 0, right: 600, top: 800 },
    crop: { left: 0, bottom: 0, right: 600, top: 800 },
  },
} as PageLayout;

async function boot() {
  const reads: Array<(v: unknown) => void> = [];
  const listeners = new Set<(e: unknown) => void>();
  const handle = {
    id: 'd',
    events: {
      subscribe: (l: (e: unknown) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => true },
    forms: { list: () => new Promise((r) => reads.push(r)) },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [interactionPlugin(), formPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return {
    kernel,
    form: kernel.capability(FormToken, 'd'),
    reads,
    emit: (e: unknown) => listeners.forEach((l) => l(e)),
  };
}
const settle = () => new Promise((r) => setTimeout(r));

describe('form refresh loop (G5)', () => {
  it('re-reads when an invalidation lands during an in-flight read', async () => {
    const h = await boot();
    expect(h.reads).toHaveLength(1); // hydration read #1 is in flight
    expect(h.form.getStatus()).toBe('loading');
    h.emit({ type: 'stream.desynced', origin: { kind: 'local' } });
    h.emit({ type: 'stream.desynced', origin: { kind: 'local' } });
    expect(h.reads).toHaveLength(1); // coalesced: nothing fires mid-read
    h.reads[0]!({ formKind: 'acroform', needsAppearances: false, fields: [] });
    await settle();
    expect(h.reads).toHaveLength(2); // exactly one follow-up read
    expect(h.form.getStatus()).toBe('ready');
    h.reads[1]!({ formKind: 'acroform', needsAppearances: false, fields: [] });
    await settle();
    expect(h.reads).toHaveLength(2); // and it settles
    await h.kernel.destroy();
  });
});
