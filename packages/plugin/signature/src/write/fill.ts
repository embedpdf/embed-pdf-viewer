/** Visual fills: the mark becomes the widget's appearance, nothing is sealed. */
import { PluginError } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import { blankPagePdf } from '../blank-page';
import type { Mark, SignatureCapability } from '../contract';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { verb } from '../services/errors';

export function createFills(
  ctx: SignatureContext,
  { events, store, marks }: Pick<SignatureServices, 'events' | 'store' | 'marks'>,
  { getSignature }: Pick<SignatureReads, 'getSignature'>,
  target: { clearIfTarget(field: FormFieldRef): void },
) {
  const { filled, cleared } = events;
  const { withBusy } = store;
  const { markBytes } = marks;

  const setAppearance = async (field: FormFieldRef, pdf: Uint8Array): Promise<void> => {
    const forms = ctx.doc.forms;
    if (!forms.setSignatureAppearance) {
      throw new PluginError(
        'unsupported',
        'signature',
        'this engine cannot draw into a signature field',
      );
    }
    const signature = getSignature(field);
    if (signature?.signed) {
      throw new PluginError('conflict', 'signature', `'${signature.fieldName}' is signed`);
    }
    await forms.setSignatureAppearance(field, { pdf, pageIndex: 0 });
  };

  const fillField = (field: FormFieldRef, mark: Mark): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, await markBytes(mark));
      target.clearIfTarget(field);
      filled.emit({ field });
    });

  const clearField = (field: FormFieldRef): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, blankPagePdf());
      cleared.emit({ field });
    });

  return {
    fillField,
    api: {
      fillField: verb(fillField),
      clearField: verb(clearField),
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureFills = ReturnType<typeof createFills>;
