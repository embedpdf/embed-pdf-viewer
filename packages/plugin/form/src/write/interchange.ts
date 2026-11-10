/**
 * Fields in and out as bundles: whole fields with their widgets, values and
 * scripts, taken out of one document and copied into another, or the same.
 */
import type { ChangeItem } from '@embedpdf/engine-core/runtime';

import type { FormCapability } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createInterchange(
  ctx: FormContext,
  services: Pick<FormServices, 'siblings' | 'enqueue'>,
) {
  const { enqueue, siblings } = services;

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
    const { signal, history, ...importOptions } = options;
    ctx.assertAllowed('doc.forms.modify', 'form.import');
    if ((importOptions.attribution ?? 'restore') === 'restore') {
      ctx.assertAllowed('doc.forms.import', 'form.import');
    }
    // After the fills on their way, as one change on the queue: the history
    // keeps it as one step unless the caller says it isn't one.
    return enqueue(async () => {
      const change = ctx.changes.stage({
        label: { key: 'form.import' },
        opId: importOptions.opId,
        history,
        send: (doc, { opId }) =>
          ctx
            .cancellable(signal, doc.forms.import(bundle, { ...importOptions, opId }))
            .then((result) => ({
              items: [{ type: 'forms.import' as const, ...result }],
              meta: result.meta,
            })),
      });
      const { items } = await change.result;
      const imported = items[0] as Extract<ChangeItem, { type: 'forms.import' }>;
      // Wait for the annotation plugin to read the new widgets, as `create()` does.
      const annotationHost = siblings.annotation();
      if (annotationHost) await annotationHost.whenSynced();
      return { fields: imported.fields, refMap: imported.refMap, dropped: imported.dropped };
    }, options);
  };

  return {
    api: { export: exportBundle, import: importBundle } satisfies Partial<FormCapability>,
  };
}
