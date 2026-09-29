import {
  assertAnnotationResources,
  pdfResolveAnnotationDraft,
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
  // What the draft means, stated whole: the one resolution a viewer's
  // pending create shares (`annotationOfDraft`). A change set carries
  // `reply` and a popup's `parent` beside the draft.
  const resolved = pdfResolveAnnotationDraft(draft, { linked: ['reply', 'parent'] });
  assertAnnotationResources(resolved.subtype, resources, 'create');
  preflightDraft(resolved, ctx);
  return resolved;
}
