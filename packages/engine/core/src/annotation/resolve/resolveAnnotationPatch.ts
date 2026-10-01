/**
 * What a patch means: the one place the engine decides which fields an
 * update changes. The writers write what this resolves and nothing more;
 * a viewer shows a pending change by applying the same resolution
 * (`applyAnnotationPatch`), so the two can't disagree.
 */
import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { checkAnnotationPatch } from '../checkWrite';
import { ANNOTATION_FIELD_NAMES } from '../field-names';
import type { Annotation, AnnotationPatch } from '../kinds';
import type { AnnotationSubtype } from '../subtype';
import type { DescribeFont } from '../fontFaces';
import { calloutEndFollows, freeTextFollows } from './freeText';
import { measurementFollows } from './measurement';
import { assertRichTextAgreement, noteStateFollows } from './text';

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

/**
 * The patch as the target's kind: its subtype filled in from the target, which
 * a caller may leave out. A different subtype, a changed name, or any change to
 * an annotation of a type the engine doesn't model is refused.
 */
function patchForTarget(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (patch.subtype !== undefined && patch.subtype !== current.subtype) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'Annotation subtype cannot change');
  }
  if (current.subtype === 'unsupported') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an annotation of a type the engine doesn't model can't be updated",
    );
  }
  if (patch.nm !== undefined && patch.nm !== current.nm) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an annotation's nm can't change after create",
    );
  }
  assertDeclaredFields(current.subtype, patch);
  return checkAnnotationPatch(current, {
    ...patch,
    subtype: current.subtype,
  } as AnnotationPatch<PdfCoordinates>);
}

/**
 * The patch the engine writes for `patch` on `current`, in the file's
 * coordinates: its subtype filled in, checked against its kind, and every
 * field that follows from it stated.
 *
 * - A drawn kind's new `rect` becomes the shape fields that put it there.
 * - Values sent back as read are dropped.
 * - A free text's `contents` and rich text follow each other, and its font,
 *   size, text color and alignment move its rich body.
 * - A callout's line stays attached to its box when the box moves or turns.
 * - A note's standard review state brings its state model.
 * - A measurement's label follows its points and scale, and a polygon's
 *   caption follows its vertices.
 *
 * Throws `InvalidArg` for a patch the engine refuses. Pure: it reads nothing
 * but its arguments.
 */
export function pdfResolveAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
  options: ResolveOptions = {},
): AnnotationPatch<PdfCoordinates> {
  const resolved = noteStateFollows(current, patchForTarget(current, patch));
  assertRichTextAgreement(resolved);
  const text = calloutEndFollows(current, freeTextFollows(current, resolved, options.describeFont));
  return measurementFollows(current, text);
}

export interface ResolveOptions {
  /**
   * Looks up a registered font by its key, so a free text's new `fontFamily`
   * moves its rich body to that face. Without it a registered key names the
   * family as it is; the standard 14 need no lookup.
   */
  describeFont?: DescribeFont;
}
