/**
 * Annotation `/F` flags — the one interpretation of ISO 32000-2 Table 167.
 *
 * `ModelAnnotation.flags` carries the named booleans verbatim from the engine DTO; every
 * behavioral question (can I see it? click it? move it? edit its text?) is
 * answered here and nowhere else, so rendering, hit-testing, chrome, and the
 * reducer can never disagree about what a flag means.
 *
 * The flag→behavior split, in one line each:
 *   hidden          — gone everywhere (screen, interaction, print)
 *   noView          — gone on screen, may still print
 *   toggleNoView    — reveals a noView annotation while engaged (v1: selected)
 *   readOnly        — visible but inert (ignored for widget kinds, per spec —
 *                     the form layer owns field-level ReadOnly)
 *   locked          — selectable but frozen: no move/resize/rotate/delete/restyle
 *   lockedContents  — `/Contents` text cannot change; geometry still can
 *   print           — include when printing (carried for the print pipeline)
 *   noZoom/noRotate — screen-anchored body (see anchor.ts)
 *   invisible       — legacy: hide unknown subtypes with no handler
 */
import { NO_ANNOTATION_FLAGS, type AnnotationFlags } from '@embedpdf/engine-core/runtime';
import { capsFor } from './kinds';

export type { AnnotationFlags };
export { NO_ANNOTATION_FLAGS };

/** The `/F` every freshly drawn annotation starts with: `print` set (Acrobat
 *  parity — without it the annotation silently disappears when printed). */
export const DRAWN_FLAGS: AnnotationFlags = { ...NO_ANNOTATION_FLAGS, print: true };

/** All ten flags, for iteration/equality — kept in the primitives' order. */
export const FLAG_KEYS = Object.keys(NO_ANNOTATION_FLAGS) as ReadonlyArray<keyof AnnotationFlags>;

export const flagsEqual = (left: AnnotationFlags, right: AnnotationFlags): boolean =>
  FLAG_KEYS.every((flag) => left[flag] === right[flag]);

/** Merge a partial write over the current flags. */
export const mergeFlags = (
  base: AnnotationFlags,
  patch: Partial<AnnotationFlags>,
): AnnotationFlags => ({
  ...base,
  ...patch,
});

/**
 * On-screen visibility. `hidden` beats everything; `noView` hides unless
 * `toggleNoView` and the annotation is engaged — the spec says hover/selection,
 * and v1 uses selection (the model tracks no hover).
 */
export const viewable = (flags: AnnotationFlags, engaged = false): boolean =>
  !flags.hidden && (!flags.noView || (flags.toggleNoView && engaged));

/** Any pointer interaction (click-to-select, hover). ReadOnly kills it. */
export const interactive = (flags: AnnotationFlags): boolean =>
  !flags.hidden && !flags.noView && !flags.readOnly;

/** The subset of an ModelAnnotation these predicates read — keeps them testable bare. */
export interface FlagBearer {
  subtype: string;
  flags: AnnotationFlags;
  /** Session authority projected at ingest (permissions.md). Absent =
   *  unstamped (drafts, wildcard local engines, tests) = allowed. */
  authority?: { update: boolean; delete: boolean };
}

/** Interaction gate for a concrete annotation: widget kinds ignore `readOnly`
 *  (ISO 32000 — a ReadOnly form field must still be movable by a form designer;
 *  the form-filling layer enforces field ReadOnly itself). */
export const annotInteractive = (annotation: FlagBearer): boolean =>
  capsFor(annotation.subtype).ignoresReadOnly
    ? !annotation.flags.hidden && !annotation.flags.noView
    : interactive(annotation.flags);

/**
 * Geometry/style mutations — `locked` freezes the object, not its contents
 * (that's `lockedContents`), and the session must hold update authority over
 * the record. One predicate for hit-test, chrome, and props alike, so a
 * record you may not edit renders and behaves exactly like a locked one.
 */
export const annotTransformable = (annotation: FlagBearer): boolean =>
  annotInteractive(annotation) &&
  !annotation.flags.locked &&
  (annotation.authority?.update ?? true);

/** Deletion — the delete half of the authority split (a narrowed grant can
 *  allow update but not delete, or vice versa). Flags gate like transforms. */
export const annotDeletable = (annotation: FlagBearer): boolean =>
  annotInteractive(annotation) &&
  !annotation.flags.locked &&
  (annotation.authority?.delete ?? true);

/** `/Contents` text edits — the contents counterpart of `locked`. */
export const annotContentsEditable = (annotation: FlagBearer): boolean =>
  annotInteractive(annotation) &&
  !annotation.flags.lockedContents &&
  (annotation.authority?.update ?? true);
