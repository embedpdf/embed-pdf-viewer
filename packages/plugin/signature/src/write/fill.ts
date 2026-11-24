/** Visual fills: the mark becomes the widget's appearance, nothing is sealed; a clear takes it out. */
import { PluginError, type OperationOptions } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { Mark, SignatureCapability } from '../contract';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';

export function createFills(
  ctx: SignatureContext,
  {
    events,
    store,
    marks,
    authority,
  }: Pick<SignatureServices, 'events' | 'store' | 'marks' | 'authority'>,
  { findSignature }: Pick<SignatureReads, 'findSignature'>,
  target: { clearIfTarget(field: FormFieldRef): void },
) {
  const { filled, cleared } = events;
  const { withBusy } = store;
  const { markBytes } = marks;

  /** Draw `mark` into the field, or take the field's mark out (`null`). */
  const setAppearance = async (
    field: FormFieldRef,
    mark: Uint8Array | null,
    options?: OperationOptions,
  ): Promise<void> => {
    const forms = ctx.doc.forms;
    if (!forms.setSignatureAppearance) {
      throw new PluginError(
        'unsupported',
        'signature',
        'this engine cannot draw into a signature field',
      );
    }
    const signature = findSignature(field);
    if (signature?.signed) {
      throw new PluginError('conflict', 'signature', `'${signature.fieldName}' is signed`);
    }
    await ctx.cancellable(options?.signal, forms.setSignatureAppearance(field, mark));
  };

  const fillField = async (
    field: FormFieldRef,
    mark: Mark,
    options?: OperationOptions,
  ): Promise<void> => {
    authority.assertAllowedField('sign', field, 'signature.fillField');
    return withBusy(async () => {
      await setAppearance(field, await markBytes(mark), options);
      target.clearIfTarget(field);
      filled.emit({ field });
    });
  };

  const clearField = async (field: FormFieldRef, options?: OperationOptions): Promise<void> => {
    authority.assertAllowedField('sign', field, 'signature.clearField');
    return withBusy(async () => {
      await setAppearance(field, null, options);
      cleared.emit({ field });
    });
  };

  return {
    fillField,
    api: {
      fillField: verb(fillField),
      clearField: verb(clearField),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureFills = ReturnType<typeof createFills>;
