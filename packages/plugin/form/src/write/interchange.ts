/** Interchange: FDF/XFDF export and import, and the repair pass. */
import type { FormDataFormat } from '@embedpdf/engine-core/runtime';

import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createInterchange(ctx: FormContext, { enqueue }: Pick<FormServices, 'enqueue'>) {
  return {
    api: {
      exportData: (format: FormDataFormat = 'xfdf') => ctx.doc.forms.exportData(format),
      importData: (data, format) => enqueue(() => ctx.doc.forms.importData(data, format)),
      repair: (options) => enqueue(() => ctx.doc.forms.repair(options)),
    } satisfies Partial<FormCapability>,
  };
}
