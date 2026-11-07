import {
  richTextParagraphsFromPlainText,
  richTextPlainText,
  type RichTextDocumentInput,
} from '../../dto/RichText';
import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { toLineBreaks } from '../../text/lineBreaks';
import { ANNOTATION_FIELD_NAMES } from '../field-names';
import type { Annotation, AnnotationDraft, AnnotationPatch } from '../kinds';

/**
 * A draft or patch that carries both `contents` and `richText` must agree:
 * `contents` is the plain projection of the rich text, line breaks however
 * spelled. A stale read sent back fails loud here instead of quietly
 * restoring old text.
 */
export function assertRichTextAgreement(input: {
  subtype?: string;
  contents?: string | null;
  richText?: RichTextDocumentInput | null;
}): void {
  if (input.richText === undefined || input.richText === null) return;
  if (input.contents === undefined || input.contents === null) return;
  if (toLineBreaks(input.contents, '\n') !== richTextPlainText(input.richText)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${input.subtype ?? 'annotation'}: \`contents\` must equal the plain projection of \`richText\` when both are given`,
    );
  }
}

/** Whether a kind's comment can be rich: a markup kind other than free text, whose rich text is drawn. */
function hasRichComment(subtype: string | undefined): boolean {
  if (subtype === undefined || subtype === 'free-text') return false;
  return (
    ANNOTATION_FIELD_NAMES[subtype as keyof typeof ANNOTATION_FIELD_NAMES]?.includes('richText') ??
    false
  );
}

/**
 * A markup annotation's comment, as its draft states it: rich text brings
 * its `contents`, its plain projection. Free text has its own rule
 * (`freeTextDraftFollows`).
 */
export function commentDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (!hasRichComment(draft.subtype)) return draft;
  const { richText } = draft as { richText?: RichTextDocumentInput | null };
  if (!richText) return draft;
  return { ...draft, contents: richTextPlainText(richText) };
}

/**
 * A markup annotation's comment follows its text (free text has its own
 * rule, `freeTextFollows`):
 *
 * - new rich text brings its `contents`;
 * - `richText: null` makes the comment plain, `contents` as it is;
 * - new `contents` on a rich comment becomes paragraphs, one per line break,
 *   over the comment's body (run formatting goes: a plain-text writer can't
 *   keep what it can't see); `null` contents clear both; a plain comment
 *   stays plain.
 */
export function commentFollows(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (!hasRichComment(patch.subtype ?? current.subtype)) return patch;
  const { richText } = patch as { richText?: RichTextDocumentInput | null };
  if (richText) return { ...patch, contents: richTextPlainText(richText) };
  if (richText === null || patch.contents === undefined) return patch;
  if (!(current as { richText?: unknown }).richText) return patch;
  if (patch.contents === null)
    return { ...patch, richText: null } as AnnotationPatch<PdfCoordinates>;
  const rewritten = { paragraphs: richTextParagraphsFromPlainText(patch.contents) };
  return {
    ...patch,
    richText: rewritten,
    contents: richTextPlainText(rewritten),
  } as AnnotationPatch<PdfCoordinates>;
}
