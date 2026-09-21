/** Visual fills: the mark becomes the widget's appearance, nothing is sealed. */
import { PluginError } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import { blankPagePdf } from '../blank-page';
import type { Mark, SignatureCapability } from '../contract';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';
import { ORIGIN_API } from '../services/events';

export function createFills(
  ctx: SignatureContext,
  {
    events,
    store,
    siblings,
    marks,
  }: Pick<SignatureServices, 'events' | 'store' | 'siblings' | 'marks'>,
  { getSignature }: Pick<SignatureReads, 'getSignature'>,
  target: { clearIfTarget(field: FormFieldRef): void },
) {
  const { filled, cleared } = events;
  const { withBusy, requireDoc } = store;
  const { form } = siblings;
  const { markBytes } = marks;

  const setAppearance = async (field: FormFieldRef, pdf: Uint8Array): Promise<void> => {
    const doc = requireDoc();
    if (!doc.forms.setSignatureAppearance) {
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
    await doc.forms.setSignatureAppearance(field, { pdf, pageIndex: 0 });
    await form.refresh();
  };

  const fillField = (field: FormFieldRef, mark: Mark): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, await markBytes(mark));
      target.clearIfTarget(field);
      filled.emit({ field, origin: ORIGIN_API });
    });

  const clearField = (field: FormFieldRef): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, blankPagePdf());
      cleared.emit({ field, origin: ORIGIN_API });
    });

  return { fillField, api: { fillField, clearField } satisfies Partial<SignatureCapability> };
}
export type SignatureFills = ReturnType<typeof createFills>;
