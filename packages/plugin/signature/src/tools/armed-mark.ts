import type { PageRef } from '@embedpdf/engine-core/runtime';
import type {
  InteractionHandler,
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import {
  ANNOTATION_EDIT_PRIORITY,
  ARMED_STAMP_TOOL_ID,
  type AnnotationHostCapability,
  type ImageGhostPlace,
} from '@embedpdf/plugin-annotation/contract/host';
import type { FormCapability, FormWidgetItem, WidgetHit } from '@embedpdf/plugin-form/contract';
import type { StampCapability } from '@embedpdf/plugin-stamp/contract';

import { SIGNATURES_LIBRARY_KIND, type SignatureCapability } from '../contract';
import { markPlaceIn } from './mark-place';

/** The cursor claim over a field that takes no mark: above the annotation layer's (20). */
const CURSOR_TOKEN = 'signature:armed-mark';
const CURSOR_PRIORITY = 30;

/** Whether two ghost places are the same box on the same page, turned the same. */
const samePlace = (left: ImageGhostPlace, right: ImageGhostPlace): boolean =>
  left.page.objectNumber === right.page.objectNumber &&
  left.rot === right.rot &&
  left.box.x === right.box.x &&
  left.box.y === right.box.y &&
  left.box.width === right.box.width &&
  left.box.height === right.box.height;

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
 * instead of onto the page, and the tool goes back to the one from before the
 * arm (`disarm`). A field that takes no mark from this user consumes the click,
 * nothing happens and the mark stays armed: a signed signature field, and a
 * signature field or an image field whose box is `disabled` (read-only, not
 * theirs to sign or fill in, or left out by the `fillable` setting), the rule
 * a press on the box follows. Everywhere else, an action button among them, it
 * declines and the click stays a stamp placement, as in Preview.
 *
 * Its hover shows what that click does. Over a field the mark goes into, the
 * armed mark's preview sits in the field's box as the fill will draw it
 * (`markPlaceIn`), through the annotation plugin's `hoverGhostIn`; over a field
 * that takes no mark, there is none, and the cursor says no (`not-allowed`,
 * a claim above the annotation layer's, which also hides the stamp's preview);
 * anywhere else the preview follows the pointer, as the stamp tool shows it.
 */
export function createArmedMarkHandler(
  documentId: string,
  signature: SignatureCapability,
  form: FormCapability,
  stamp: StampCapability,
  annotation: AnnotationHostCapability | null = null,
  interaction: InteractionHostCapability | null = null,
): InteractionHandler {
  /** The box under the pointer, as the form lists it for this user. */
  const itemOf = (page: PageRef, hit: WidgetHit): FormWidgetItem | null =>
    form.listWidgets(page).find((item) => item.annotObjectNumber === hit.annotObjectNumber) ?? null;

  /**
   * Whether the box takes no mark from this user: its field is a signed signature field, or its
   * fill control is `disabled`.
   */
  const takesNoMark = (page: PageRef, hit: WidgetHit): boolean =>
    (hit.field.kind === 'signature' &&
      (signature.getSignature(hit.field.ref)?.signed === true ||
        hit.field.valueEntry.kind !== 'none')) ||
    (itemOf(page, hit)?.disabled ?? true);

  /**
   * The person's armed mark and the field box under the pointer that it goes into: a signature
   * field's or an image field's; `null` anywhere else, or for a stamp that isn't a person's mark.
   */
  const markFieldAt = (
    sample: PointerSample,
  ): { page: PageRef; hit: WidgetHit; assetId: string } | null => {
    if (!sample.page) return null;
    const armed = stamp.getArmedAsset(documentId);
    if (!armed || stamp.getLibrary(armed.libraryId)?.kind !== SIGNATURES_LIBRARY_KIND) {
      return null;
    }
    const hit = form.getWidgetAt(sample.page.ref, sample.page.point);
    return hit && (hit.field.kind === 'signature' || hit.imageBox)
      ? { page: sample.page.ref, hit, assetId: armed.id }
      : null;
  };

  /** The place the preview is shown in now: the same object while it stays the same box. */
  let shown: ImageGhostPlace | null = null;
  /** Show the preview in `place`, or give it back to the pointer (`null`); refuse with the cursor. */
  const preview = (place: ImageGhostPlace | null, refuse: boolean): void => {
    if (place === null || shown === null || !samePlace(place, shown)) shown = place;
    annotation?.hoverGhostIn(shown);
    interaction?.claimCursor(CURSOR_TOKEN, refuse ? 'not-allowed' : null, CURSOR_PRIORITY);
  };

  return {
    id: 'signature:armed-mark-on-field',
    priority: ANNOTATION_EDIT_PRIORITY + 1,
    enabledFor: (tool) => tool.id === ARMED_STAMP_TOOL_ID,
    onHover: (sample) => {
      const over = markFieldAt(sample);
      if (!over) return preview(null, false);
      const { page, hit } = over;
      if (takesNoMark(page, hit)) return preview(null, true);
      const item = itemOf(page, hit);
      const size = annotation?.getArmedStamp();
      const place = item && size ? markPlaceIn(item, size) : null;
      preview(place && { page, box: place.box, rot: place.rot }, false);
    },
    onPointerDown: (sample) => {
      const over = markFieldAt(sample);
      if (!over) return false;
      const { page, hit, assetId } = over;
      // No stamp lands on it either, no write is refused, and the mark stays armed.
      if (takesNoMark(page, hit)) return true;
      stamp.disarm(documentId);
      void signature
        .placeMark({ assetId }, { field: hit.field.ref })
        .catch((error) => globalThis.console?.error('[signature] placing the mark failed:', error));
      return true;
    },
  };
}
