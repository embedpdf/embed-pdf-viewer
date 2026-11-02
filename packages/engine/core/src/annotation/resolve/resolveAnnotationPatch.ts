/**
 * What a patch means: the one place the engine decides which fields an
 * update changes. An update is prepared (`pdfPrepareAnnotationPatch`), then
 * what follows from it is derived (`pdfDeriveAnnotationPatch`). The engine
 * checks the prepared patch against its kind's schema between the two
 * (`pdfResolveAnnotationPatch`, from `@embedpdf/engine-core/validation`), a
 * check that only accepts or refuses; a viewer shows a pending change by
 * running the same two steps without schema validation (`applyAnnotationPatch`),
 * so the two can't disagree. The writers write what this resolves and nothing
 * more.
 */
import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { ANNOTATION_FIELD_NAMES } from '../field-names';
import type { Annotation, AnnotationPatch } from '../kinds';
import type { AnnotationSubtype } from '../subtype';
import type { DescribeFont } from '../fontFaces';
import { calloutEndFollows, freeTextFollows } from './freeText';
import { measurementFollows } from './measurement';
import { pdfResolveRectCommand } from './rectCommand';
import { withoutUnchangedColors, withoutUnchangedFields } from './sentBack';
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
 * a caller may leave out. A different subtype, a changed name, a field the
 * kind doesn't declare, or any change to an annotation of a type the engine
 * doesn't model is refused.
 */
function annotationPatchForTarget(
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
  return { ...patch, subtype: current.subtype } as AnnotationPatch<PdfCoordinates>;
}

/**
 * The patch an update writes before anything follows from it, in the file's
 * coordinates, the same on the page and in the engine:
 *
 * - its subtype filled in from `current` (a different one is refused, as is
 *   a field the kind doesn't declare and a changed `nm`);
 * - a drawn kind's `rect`: the rect it reads, sent back, dropped; another one
 *   the shape fields that put the drawing there (`pdfResolveRectCommand`);
 * - a color sent back as it reads dropped, so the file keeps it as it has it;
 * - every other field sent back as it reads dropped: it is not a change
 *   (`withoutUnchangedFields`).
 *
 * A changed value stays whatever it is: whether the kind can write it is the
 * engine's check, which never adds, drops or changes a field.
 */
export function pdfPrepareAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  const targeted = annotationPatchForTarget(current, patch);
  return withoutUnchangedFields(
    current,
    withoutUnchangedColors(current, pdfResolveRectCommand(current, targeted)),
  );
}

/**
 * A prepared patch with every field that follows from it stated, in the
 * file's coordinates:
 *
 * - a note's standard review state brings its state model;
 * - a free text's `contents` and rich text follow each other, and its font,
 *   size, text color and alignment move its rich body;
 * - a callout's line stays attached to its box when the box moves or turns;
 * - a measurement's label follows its points and scale, and a polygon's
 *   caption follows its vertices.
 *
 * Throws `InvalidArg` where nothing can follow. Pure: it reads nothing but its
 * arguments.
 */
export function pdfDeriveAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  prepared: AnnotationPatch<PdfCoordinates>,
  options: ResolveOptions = {},
): AnnotationPatch<PdfCoordinates> {
  const resolved = noteStateFollows(current, prepared);
  assertRichTextAgreement(resolved);
  const text = calloutEndFollows(current, freeTextFollows(current, resolved, options.describeFont));
  return measurementFollows(current, text);
}

/**
 * The patch the engine writes for `patch` on `current`, as a viewer predicts
 * it, in the file's coordinates: prepared and derived as the engine does
 * (`pdfPrepareAnnotationPatch`, `pdfDeriveAnnotationPatch`), without schema
 * validation. A patch the engine's schema check refuses
 * (`pdfResolveAnnotationPatch`, from `@embedpdf/engine-core/validation`) is
 * refused when the update reaches it.
 *
 * Throws `InvalidArg` for what preparation and derivation refuse: a field the
 * kind doesn't declare, a changed subtype or name, a rect with a new shape or
 * that isn't finite, and where nothing can follow.
 */
export function pdfPredictAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
  options: ResolveOptions = {},
): AnnotationPatch<PdfCoordinates> {
  return pdfDeriveAnnotationPatch(current, pdfPrepareAnnotationPatch(current, patch), options);
}

export interface ResolveOptions {
  /**
   * Looks up a font a box can name (a registered key, a document font's
   * name), so a free text's new `fontFamily` moves its rich body to that
   * font's face. Without it such a name stands as a family; the standard 14
   * need no lookup.
   */
  describeFont?: DescribeFont;
}
