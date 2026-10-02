/** Form data in and out: FDF or XFDF bytes, the format told from the bytes on the way in. */
import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createInterchange(ctx: FormContext, { enqueue }: Pick<FormServices, 'enqueue'>) {
  return {
    api: {
      export: async (format = 'xfdf', options) => {
        ctx.assertAllowed('doc.forms.read', 'form.export');
        return ctx.cancellable(options?.signal, ctx.doc.forms.export(format));
      },
      import: async (data, options) => {
        ctx.assertAllowed('doc.forms.fill', 'form.import');
        return enqueue(() => ctx.cancellable(options?.signal, ctx.doc.forms.import(data)), options);
      },
    } satisfies Partial<FormCapability>,
  };
}
