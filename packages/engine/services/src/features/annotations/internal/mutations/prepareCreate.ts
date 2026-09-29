import {
  assertAnnotationDraft,
  assertAnnotationResources,
  assertDeclaredFields,
  assertRichTextAgreement,
  resolveMeasurementDraft,
  type AnnotationDraft,
  type WireAnnotationResources,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationWriteContext } from '../write/annotationWriteContext';
import { preflightDraft } from '../write/annotationWriterRegistry';

/**
 * Everything a create checks before its first write, and the draft as it
 * is written. `create` and `import` share it, so an item imports exactly
 * when the same create would succeed.
 */
export function prepareCreate(
  draft: AnnotationDraft<PdfCoordinates>,
  resources: WireAnnotationResources | undefined,
  ctx: AnnotationWriteContext,
): AnnotationDraft<PdfCoordinates> {
  assertDeclaredFields(draft.subtype, draft);
  // A change set carries `reply` and a popup's `parent` beside the draft.
  assertAnnotationDraft(draft, { linked: ['reply', 'parent'] });
  assertAnnotationResources(draft.subtype, resources, 'create');
  preflightDraft(draft, ctx);
  assertRichTextAgreement(draft);
  return resolveMeasurementDraft(draft);
}
