/** Interchange: FDF/XFDF export and import, and the repair pass. */
import type { FormDataFormat } from '@embedpdf/engine-core/runtime';

import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

export function createInterchange(
  ctx: FormContext,
  { store, enqueue }: Pick<FormServices, 'store' | 'enqueue'>,
  hydration: FormHydration,
) {
  const { apply } = store;
  const enqueueMutation = enqueue;
  const { refresh } = hydration;

  return {
    api: {
      exportData: async (format: FormDataFormat = 'xfdf') => {
        const doc = ctx.doc;
        if (!doc) throw new Error('no document');
        return doc.forms.exportData(format);
      },
      importData: (data, format) =>
        enqueueMutation(async () => {
          const doc = ctx.doc;
          if (!doc) throw new Error('no document');
          const result = await doc.forms.importData(data, format);
          apply({ t: 'snapshot', snapshot: result.snapshot });
          return result;
        }),
      repair: (repairOptions) =>
        enqueueMutation(async () => {
          const doc = ctx.doc;
          if (!doc) throw new Error('no document');
          const result = await doc.forms.repair(repairOptions);
          await refresh();
          return result;
        }),
    } satisfies Partial<FormCapability>,
  };
}
