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
import type { DescribeFont } from '../fontFaces';
import type { Annotation, AnnotationPatch } from '../kinds';
import { fieldTheKindCannotHold, siblingKindsOf } from '../siblings';
import type { AnnotationSubtype } from '../subtype';
import { assertRichTextAgreement, commentFollows } from './comment';
import { dashPatchFollows } from './dash';
import { calloutEndFollows, freeTextFollows } from './freeText';
import { measurementFollows } from './measurement';
import { pdfResolveRectCommand } from './rectCommand';
import { withoutUnchangedColors, withoutUnchangedFields } from './sentBack';
import { noteStateFollows } from './text';

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

/** `['a', 'b', 'c']` as "a, b or c". */
function orList(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/**
 * The kind an update leaves the annotation: its own, or the sibling the patch
 * names (`siblingKindsOf`), which takes the same fields. Any other subtype is
 * refused, naming the kinds it can become. A value the new kind has no field
 * for is refused, never dropped: the caller clears it first, in the same
 * change.
 */
function kindAfter(
  current: Annotation<PdfCoordinates>,
  requested: string | undefined,
): AnnotationSubtype {
  if (requested === undefined || requested === current.subtype) return current.subtype;
  const siblings = siblingKindsOf(current.subtype);
  if (!siblings.includes(requested as AnnotationSubtype)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      siblings.length === 0
        ? `${current.subtype} has no other kind it can become`
        : `${current.subtype} can become ${orList(siblings)}, not ${requested}`,
      { details: { field: 'subtype' } },
    );
  }
  const held = fieldTheKindCannotHold(current, requested);
  if (held !== null) {
    const value = (current as unknown as Record<string, unknown>)[held];
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} field '${held}' holds ${typeof value === 'string' ? `'${value}'` : JSON.stringify(value)}, and ${requested} has no such field: clear it first, in the same change`,
      { details: { field: held } },
    );
  }
  return requested as AnnotationSubtype;
}

/**
 * The patch as the kind it leaves the annotation (`kindAfter`): its subtype
 * filled in, which a caller may leave out. A subtype the annotation can't
 * become, a field the kind doesn't declare, or any change to an annotation of
 * a type the engine doesn't model is refused.
 */
function annotationPatchForTarget(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  const subtype = kindAfter(current, patch.subtype);
  if (current.subtype === 'unsupported') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "an annotation of a type the engine doesn't model can't be updated",
    );
  }
  assertDeclaredFields(subtype, patch);
  return { ...patch, subtype } as AnnotationPatch<PdfCoordinates>;
}

/**
 * The patch an update writes before anything follows from it, in the file's
 * coordinates, the same on the page and in the engine:
 *
 * - its subtype filled in from `current`, or a sibling kind it names (any
 *   other is refused, as is a field the kind doesn't declare);
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
 * - a border made dashed with its pattern left out, on a border that has
 *   none, states the default pattern, `[3, 3]`;
 * - a free text's `contents` and rich text follow each other, and its font,
 *   size, text color and alignment move its rich body;
 * - so do another markup annotation's: new rich text brings its `contents`,
 *   and new `contents` rewrites a rich comment's paragraphs;
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
  const resolved = dashPatchFollows(current, noteStateFollows(current, prepared));
  assertRichTextAgreement(resolved);
  const text = calloutEndFollows(
    current,
    commentFollows(current, freeTextFollows(current, resolved, options.describeFont)),
  );
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
 * kind doesn't declare, a subtype the annotation can't become, a rect with a
 * new shape or that isn't finite, and where nothing can follow.
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
