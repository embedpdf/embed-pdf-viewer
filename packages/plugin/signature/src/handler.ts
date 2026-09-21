import type { InteractionHandler } from '@embedpdf/plugin-interaction/contract';
import {
  ANNOTATION_EDIT_PRIORITY,
  ARMED_STAMP_TOOL_ID,
} from '@embedpdf/plugin-annotation/contract/host';
import type { FormCapability } from '@embedpdf/plugin-form/contract';
import type { StampCapability } from '@embedpdf/plugin-stamp/contract';

import { SIGNATURES_LIBRARY_KIND, type SignatureCapability } from './types';

/**
 * The armed mark over a field. The annotation plugin places an armed stamp
 * on click (`annotation-place`, priority 95) and selects an existing
 * annotation under the pointer before that (`annotation-edit`, 100 — a
 * widget is an annotation). This handler sits above BOTH, enabled for the
 * armed stamp's tool only, and captures exactly when the armed asset is a
 * person's mark (a library of kind `signatures`) and the pointer is over a
 * signature field: then the destination decides — the mark goes INTO the
 * field (`placeMark` by mode) instead of onto the page. Everywhere else it
 * declines and the click stays a stamp placement, as in Preview.
 */
export function createArmedMarkHandler(
  documentId: string,
  signature: SignatureCapability,
  form: FormCapability,
  stamp: StampCapability,
): InteractionHandler {
  return {
    id: 'signature:armed-mark-on-field',
    priority: ANNOTATION_EDIT_PRIORITY + 1,
    enabledFor: (tool) => tool.id === ARMED_STAMP_TOOL_ID,
    onDown: (sample) => {
      if (!sample.page) return false;
      const armed = stamp.getArmedAsset(documentId);
      if (!armed || stamp.getLibrary(armed.libraryId)?.kind !== SIGNATURES_LIBRARY_KIND)
        return false;
      const hit = form.getWidgetAt(sample.page.ref, sample.page.point);
      if (!hit || hit.field.family !== 'signature') return false;
      // A signed field is final: consume the click (no stamp lands on it) and do nothing.
      if (signature.signatureOf(hit.field.ref)?.signed || hit.field.valueEntry.kind !== 'none') {
        return true;
      }
      stamp.disarm(documentId);
      void signature
        .placeMark({ assetId: armed.id }, { field: hit.field.ref })
        .catch((error) => globalThis.console?.error('[signature] placing the mark failed:', error));
      return true;
    },
  };
}
