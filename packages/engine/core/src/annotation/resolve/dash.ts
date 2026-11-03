import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { annotationDefaultsOf } from '../defaults';
import { kindFactsOf } from '../kind-facts';
import type { AnnotationDraft, Annotation, AnnotationPatch } from '../kinds';

/**
 * ISO 32000's default dash (`[3]`), 3 on and 3 off: what a dashed border
 * draws when it names no pattern of its own. Written as both lengths, as the
 * viewer offers it.
 */
export const DEFAULT_DASH_ARRAY: readonly number[] = [3, 3];

/**
 * Whether a border written as `borderStyle` with `dashArray` must state the
 * default pattern: a dashed one that names none of its own (no pattern, or
 * an empty one). ISO 32000 draws such a border with the default, but Acrobat,
 * redrawing it, draws it solid; written out as `/D [3 3]`, both draw it dashed.
 */
export function needsDefaultDash(
  borderStyle: unknown,
  dashArray: readonly number[] | null | undefined,
): boolean {
  return borderStyle === 'dashed' && (dashArray == null || dashArray.length === 0);
}

/** A border's own fields, on a kind that has a dash pattern. */
interface BorderFields {
  borderStyle?: unknown;
  dashArray?: readonly number[] | null;
}

const hasDashPattern = (subtype: string): boolean =>
  kindFactsOf(subtype)?.owners.dashArray !== undefined;

/** A draft whose border is dashed with no pattern of its own states the default (`needsDefaultDash`). */
export function dashDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (!hasDashPattern(draft.subtype)) return draft;
  const border = draft as BorderFields;
  const style = border.borderStyle ?? annotationDefaultsOf(draft.subtype).borderStyle;
  if (!needsDefaultDash(style, border.dashArray)) return draft;
  return { ...draft, dashArray: [...DEFAULT_DASH_ARRAY] } as AnnotationDraft<PdfCoordinates>;
}

/**
 * A patch that changes a border's style or pattern and leaves it dashed with
 * no pattern of its own states the default, as a draft does. A patch that
 * touches neither leaves the border as the file has it.
 */
export function dashPatchFollows(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (!hasDashPattern(current.subtype)) return patch;
  const change = patch as BorderFields;
  if (change.borderStyle === undefined && change.dashArray === undefined) return patch;
  const now = current as BorderFields;
  const style = change.borderStyle ?? now.borderStyle;
  const dashArray = change.dashArray !== undefined ? change.dashArray : now.dashArray;
  if (!needsDefaultDash(style, dashArray)) return patch;
  return { ...patch, dashArray: [...DEFAULT_DASH_ARRAY] } as AnnotationPatch<PdfCoordinates>;
}
