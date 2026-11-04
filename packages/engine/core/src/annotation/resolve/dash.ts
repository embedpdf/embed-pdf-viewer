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
 * Whether a border written as `borderStyle` with `dashArray` takes the
 * default pattern: a dashed one whose write leaves its pattern out. ISO 32000
 * draws a dashed border without `/D` with the default, but Acrobat, redrawing
 * it, draws it solid; written out as `/D [3 3]`, both draw it dashed. `null`
 * is no pattern, as everywhere: written as none, it reads back `null`. (An
 * empty pattern is no write's: `DashArrayWriteSchema` refuses it.)
 */
export function needsDefaultDash(
  borderStyle: unknown,
  dashArray: readonly number[] | null | undefined,
): boolean {
  return borderStyle === 'dashed' && dashArray === undefined;
}

/** A border's own fields, on a kind that has a dash pattern. */
interface BorderFields {
  borderStyle?: unknown;
  dashArray?: readonly number[] | null;
}

const hasDashPattern = (subtype: string): boolean =>
  kindFactsOf(subtype)?.owners.dashArray !== undefined;

/** A draft whose border is dashed with its pattern left out states the default (`needsDefaultDash`). */
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
 * A patch that makes a border dashed and leaves its pattern out, on a border
 * that has none, states the default, as a draft does. A pattern the patch
 * gives, `null` among them, is written as given, and a patch that leaves the
 * style alone leaves the border as the file has it.
 */
export function dashPatchFollows(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (!hasDashPattern(current.subtype)) return patch;
  const change = patch as BorderFields;
  if (!needsDefaultDash(change.borderStyle, change.dashArray)) return patch;
  if ((current as BorderFields).dashArray != null) return patch;
  return { ...patch, dashArray: [...DEFAULT_DASH_ARRAY] } as AnnotationPatch<PdfCoordinates>;
}
