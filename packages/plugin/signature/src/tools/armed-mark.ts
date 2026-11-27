import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { InteractionHandler } from '@embedpdf/plugin-interaction/contract/host';
import {
  ANNOTATION_EDIT_PRIORITY,
  ARMED_STAMP_TOOL_ID,
} from '@embedpdf/plugin-annotation/contract/host';
import type { FormCapability, WidgetHit } from '@embedpdf/plugin-form/contract';
import type { StampCapability } from '@embedpdf/plugin-stamp/contract';

import { SIGNATURES_LIBRARY_KIND, type SignatureCapability } from '../contract';

/**
 * The armed mark over a field. The annotation plugin places an armed stamp
 * on click (`annotation-place`, priority 95) and selects an existing
 * annotation under the pointer before that (`annotation-edit`, 100; a
 * widget is an annotation). This handler sits above both, enabled for the
 * armed stamp's tool only, and captures exactly when the armed asset is a
 * person's mark (a library of kind `signatures`) and the pointer is over a
 * signature field or an image field's box (`imageBox`): then the destination
 * decides, and the mark goes into the field (`placeMark`: by mode in a
 * signature field, as its picture in an image field, in place of one it holds)
 * instead of onto the page. A field that takes no mark from this user consumes
 * the click and nothing happens: a signed signature field, and an image field
 * whose box is `disabled` (read-only, not theirs to fill in, or left out by the
 * `fillable` setting), the rule a press on the box follows. Everywhere else,
 * an action button among them, it declines and the click stays a stamp
 * placement, as in Preview.
 */
export function createArmedMarkHandler(
  documentId: string,
  signature: SignatureCapability,
  form: FormCapability,
  stamp: StampCapability,
): InteractionHandler {
  /** Whether the user puts no picture in this image box by hand: its fill control is `disabled`. */
  const takesNoPicture = (page: PageRef, hit: WidgetHit): boolean =>
    form.listWidgets(page).find((item) => item.annotObjectNumber === hit.annotObjectNumber)
      ?.disabled ?? true;

  return {
    id: 'signature:armed-mark-on-field',
    priority: ANNOTATION_EDIT_PRIORITY + 1,
    enabledFor: (tool) => tool.id === ARMED_STAMP_TOOL_ID,
    onPointerDown: (sample) => {
      if (!sample.page) return false;
      const armed = stamp.getArmedAsset(documentId);
      if (!armed || stamp.getLibrary(armed.libraryId)?.kind !== SIGNATURES_LIBRARY_KIND)
        return false;
      const hit = form.getWidgetAt(sample.page.ref, sample.page.point);
      if (!hit) return false;
      if (hit.field.kind === 'signature') {
        // A signed field is final: consume the click (no stamp lands on it) and do nothing.
        if (signature.getSignature(hit.field.ref)?.signed || hit.field.valueEntry.kind !== 'none') {
          return true;
        }
      } else if (hit.imageBox) {
        // Not the user's to fill in: no stamp lands on it either, and no write is refused.
        if (takesNoPicture(sample.page.ref, hit)) return true;
      } else {
        return false;
      }
      stamp.disarm(documentId);
      void signature
        .placeMark({ assetId: armed.id }, { field: hit.field.ref })
        .catch((error) => globalThis.console?.error('[signature] placing the mark failed:', error));
      return true;
    },
  };
}
