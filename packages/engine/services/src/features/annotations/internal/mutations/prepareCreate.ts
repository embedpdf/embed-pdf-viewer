import {
  ANNOTATION_FIELD_NAMES,
  assertAnnotationDraft,
  assertAnnotationResources,
  EngineError,
  EngineErrorCode,
  type AnnotationDraft,
  type AnnotationSubtype,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { prepareMeasurementDraft } from './prepareMeasurementMutation';
import { assertRichTextAgreement } from '../richTextWire';
import type { AnnotationWriteContext } from '../write/annotationWriteContext';
import { preflightDraft } from '../write/annotationWriterRegistry';

/**
 * Everything a create checks before its first write, and the draft as it
 * is written. `create` and `import` share it, so an item imports exactly
 * when the same create would succeed.
 */
export function prepareCreate(
  draft: AnnotationDraft,
  resources: WireAnnotationResources | undefined,
  ctx: AnnotationWriteContext,
): AnnotationDraft {
  assertDeclaredFields(draft.subtype, draft);
  // A change set carries `reply` and a popup's `parent` beside the draft.
  assertAnnotationDraft(draft, { linked: ['reply', 'parent'] });
  assertAnnotationResources(draft.subtype, resources, 'create');
  preflightDraft(draft, ctx);
  assertRichTextAgreement(draft);
  return prepareMeasurementDraft(draft);
}

/** A write names only fields its kind declares: a misspelled or foreign field is refused, never ignored. */
export function assertDeclaredFields(subtype: AnnotationSubtype, write: object): void {
  const known = ANNOTATION_FIELD_NAMES[subtype];
  const unknown = Object.keys(write).filter((name) => name !== 'subtype' && !known.includes(name));
  if (unknown.length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${subtype} has no field ${unknown.map((name) => `'${name}'`).join(', ')}`,
    );
  }
}
