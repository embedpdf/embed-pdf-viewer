import { describe, expect, test } from 'vitest';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { DecodedImageStore } from '../../services/src/document-session/pages/DecodedImageStore';

function createFakeRuntime(options = { canStore: true }) {
  const budgets: number[] = [];
  const fn: Record<string, unknown> = {};
  if (options.canStore) {
    fn.EPDF_SetDecodedImageBudget = (bytes: number) => {
      budgets.push(bytes);
    };
  }
  return { runtime: { fn } as unknown as PdfRuntimeModule, budgets };
}

describe('DecodedImageStore', () => {
  test('keeps decodes during read-only jobs and empties the store before any other job', () => {
    const { runtime, budgets } = createFakeRuntime();
    const store = new DecodedImageStore(runtime, 1000);

    store.beginJob(true);
    store.beginJob(true);
    store.beginJob(false);
    store.beginJob(false);
    store.beginJob(true);

    // The runtime is only told when the verdict changes.
    expect(budgets).toEqual([1000, 0, 1000]);
  });

  test('keeps nothing on a runtime without the store or with no budget', () => {
    const without = createFakeRuntime({ canStore: false });
    const noBudget = createFakeRuntime();
    const stores = [
      new DecodedImageStore(without.runtime, 1000),
      new DecodedImageStore(noBudget.runtime, 0),
    ];

    for (const store of stores) {
      expect(store.enabled).toBe(false);
      store.beginJob(true);
    }
    expect(noBudget.budgets).toEqual([]);
  });
});
