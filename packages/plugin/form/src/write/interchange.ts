/**
 * Fields in and out as bundles: whole fields with their widgets, values and
 * scripts, taken out of one document and copied into another, or the same.
 */
import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createInterchange(
  ctx: FormContext,
  services: Pick<FormServices, 'siblings' | 'enqueue'>,
) {
  const { enqueue } = services;
  const annotationHost = services.siblings.annotation;

  const exportBundle: FormCapability['export'] = async (selection = {}, options) => {
    ctx.assertAllowed('doc.forms.read', 'form.export');
    ctx.assertAllowed('doc.download', 'form.export');
    const pages = selection.pages?.map((page) => ctx.pageOf(page).ref);
    // What the user sees is what the bundle carries: pending writes land first.
    return enqueue(
      () =>
        ctx.cancellable(
          options?.signal,
          ctx.doc.forms.export({
            ...(selection.fields ? { fields: selection.fields } : {}),
            ...(pages ? { pages } : {}),
          }),
        ),
      options,
    );
  };

  const importBundle: FormCapability['import'] = async (bundle, options = {}) => {
    const { signal, ...importOptions } = options;
    ctx.assertAllowed('doc.forms.modify', 'form.import');
    if ((importOptions.attribution ?? 'restore') === 'restore') {
      ctx.assertAllowed('doc.forms.import', 'form.import');
    }
    return enqueue(async () => {
      const result = await ctx.cancellable(signal, ctx.doc.forms.import(bundle, importOptions));
      // Wait for the annotation plugin to read the new widgets, as `create()` does.
      if (annotationHost) await annotationHost.whenSynced();
      return { fields: result.fields, refMap: result.refMap, dropped: result.dropped };
    }, options);
  };

  return {
    api: { export: exportBundle, import: importBundle } satisfies Partial<FormCapability>,
  };
}
