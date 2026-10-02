/**
 * Building the form: fields are created, changed and deleted, and widgets
 * taken out of their field, through `doc.forms`. The fields and widget
 * mirrors apply the confirmed results, and the annotation plugin applies the
 * widget changes from the same events.
 */
import type { OperationOptions } from '@embedpdf/core';

import type { FormCapability, FormFieldResult } from '../contract';
import type { FormContext, FormServices } from '../services';

const MODIFY = 'doc.forms.modify';

export function createFieldWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'siblings' | 'enqueue'>,
) {
  const { enqueue } = services;
  const annotationHost = services.siblings.annotation;

  /** Run one building write in the queue, refused up front without `doc.forms.modify`. */
  const design = async <T>(
    operation: string,
    run: () => Promise<T>,
    options?: OperationOptions,
  ): Promise<T> => {
    ctx.assertAllowed(MODIFY, operation);
    return enqueue(() => ctx.cancellable(options?.signal, run()), options);
  };

  const create: FormCapability['create'] = (draft, options) =>
    design(
      'form.create',
      async (): Promise<FormFieldResult> => {
        const { field } = await ctx.doc.forms.create(draft);
        // Wait for the annotation plugin to read the new widgets, so a caller
        // can select one right away.
        if (annotationHost) await annotationHost.whenSynced();
        return { field };
      },
      options,
    );

  return {
    api: {
      create,
      update: (ref, patch, options) =>
        design(
          'form.update',
          async () => ({ field: (await ctx.doc.forms.update(ref, patch)).field }),
          options,
        ),
      delete: (ref, options) =>
        design(
          'form.delete',
          async () => {
            await ctx.doc.forms.delete(ref);
          },
          options,
        ),
      removeWidget: (ref, widget, options) =>
        design(
          'form.removeWidget',
          async () => ({ field: (await ctx.doc.forms.removeWidget(ref, widget)).field }),
          options,
        ),
      repair: (options) =>
        design(
          'form.repair',
          () => {
            if (!options) return ctx.doc.forms.repair();
            const { signal: _signal, ...repair } = options;
            return ctx.doc.forms.repair(repair);
          },
          options,
        ),
    } satisfies Partial<FormCapability>,
  };
}
