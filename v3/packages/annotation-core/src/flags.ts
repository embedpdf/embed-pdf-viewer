/**
 * Annotation `/F` flags — the ONE interpretation of ISO 32000-2 Table 167.
 *
 * `Annot.flags` carries the named booleans verbatim from the engine DTO; every
 * behavioral question (can I see it? click it? move it? edit its text?) is
 * answered HERE and nowhere else, so rendering, hit-testing, chrome, and the
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

/** The `/F` every freshly DRAWN annotation starts with: `print` set (Acrobat
 *  parity — without it the annotation silently disappears when printed). */
export const DRAWN_FLAGS: AnnotationFlags = { ...NO_ANNOTATION_FLAGS, print: true };

/** All ten flags, for iteration/equality — kept in the primitives' order. */
export const FLAG_KEYS = Object.keys(NO_ANNOTATION_FLAGS) as ReadonlyArray<keyof AnnotationFlags>;

export const flagsEqual = (a: AnnotationFlags, b: AnnotationFlags): boolean =>
  FLAG_KEYS.every((k) => a[k] === b[k]);

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
 * `toggleNoView` and the annotation is ENGAGED — the spec says hover/selection,
 * and v1 uses selection (the model tracks no hover).
 */
export const viewable = (f: AnnotationFlags, engaged = false): boolean =>
  !f.hidden && (!f.noView || (f.toggleNoView && engaged));

/** Any pointer interaction (click-to-select, hover). ReadOnly kills it. */
export const interactive = (f: AnnotationFlags): boolean => !f.hidden && !f.noView && !f.readOnly;

/** The subset of an Annot these predicates read — keeps them testable bare. */
export interface FlagBearer {
  subtype: string;
  flags: AnnotationFlags;
}

/** Interaction gate for a concrete annotation: widget kinds ignore `readOnly`
 *  (ISO 32000 — a ReadOnly form field must still be movable by a form designer;
 *  the form-filling layer enforces field ReadOnly itself). */
export const annotInteractive = (a: FlagBearer): boolean =>
  capsFor(a.subtype).ignoresReadOnly ? !a.flags.hidden && !a.flags.noView : interactive(a.flags);

/** Geometry/style/delete mutations — `locked` freezes the OBJECT, not its
 *  contents (that's `lockedContents`). */
export const annotTransformable = (a: FlagBearer): boolean =>
  annotInteractive(a) && !a.flags.locked;

/** `/Contents` text edits — the contents counterpart of `locked`. */
export const annotContentsEditable = (a: FlagBearer): boolean =>
  annotInteractive(a) && !a.flags.lockedContents;
