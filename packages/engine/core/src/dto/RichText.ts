import type { TextAlignment } from '../annotation/primitives';

/**
 * Rich text of a FreeText annotation (`/RC` + `/DS`), the model the engine
 * lays out and writes. Runs carry only the style they override (deltas
 * against the body), exactly as the XHTML spans do, so changing the body
 * style moves every run that did not override that property.
 *
 * Families name faces the way a PDF does: a standard-14 family
 * (`"Helvetica"`), a font registered through `engine.fonts` (its family, or
 * its `key` — the engine resolves either), or a family already embedded in
 * the document. A family that resolves nowhere substitutes Helvetica; the
 * appearance still renders and the box still edits.
 */
export type RichTextDecoration = 'underline' | 'line-through' | 'word';
export type RichTextScript = 'normal' | 'sub' | 'super';
export type RichTextAlign = TextAlignment | 'justify';
export type RichTextDirection = 'ltr' | 'rtl';

export interface RichTextRunStyle {
  family: string;
  /** 100..900. */
  weight: number;
  italic: boolean;
  /** Points. */
  size: number;
  /** `#RRGGBB`. */
  color: string;
  decoration: RichTextDecoration[];
  script: RichTextScript;
  /** Points, added after every glyph. */
  letterSpacing: number;
  /** 1 = normal (`xfa-font-horizontal-scale` / 100). */
  horizontalScale: number;
  /** CSS declarations the engine does not model, kept verbatim. */
  unknown?: string;
}

export interface RichTextMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface RichTextParagraphProps {
  align: RichTextAlign;
  dir: RichTextDirection;
  /** Points; absent = the normal line box. */
  lineHeight?: number;
  margins?: RichTextMargins;
  textIndent?: number;
  unknown?: string;
}

export interface RichTextRun {
  /** May contain `\r`: a hard line break inside the paragraph. */
  text: string;
  /** The properties this run overrides. Absent = the body style. */
  style?: Partial<RichTextRunStyle>;
}

/** A paragraph: its own alignment/direction when they differ from the body's. */
export interface RichTextParagraph extends Partial<RichTextParagraphProps> {
  runs: RichTextRun[];
}

export type RichTextBody = RichTextRunStyle & RichTextParagraphProps;

/** What an annotation reads back: a complete body, every paragraph resolved. */
export interface RichTextDocument {
  body: RichTextBody;
  paragraphs: RichTextParagraph[];
}

/**
 * What a draft or patch writes. `body` may be omitted (the annotation's
 * current body style stays — the "plain text replacement" of the patch
 * table) or partial (missing properties take the engine's defaults:
 * Helvetica 12 pt black, left-aligned, ltr).
 */
export interface RichTextDocumentInput {
  body?: Partial<RichTextBody>;
  paragraphs: RichTextParagraph[];
}

/** The plain-text projection of a rich document: paragraphs joined by `\r`,
 *  runs concatenated — what the engine writes to `/Contents`. */
export function richTextPlainText(doc: { paragraphs: readonly RichTextParagraph[] }): string {
  return doc.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\r');
}

/** Plain text as rich paragraphs: one per line break, one run each, no
 *  overrides (the engine's own `/Contents` fallback shape). */
export function richTextParagraphsFromPlainText(text: string): RichTextParagraph[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({ runs: [{ text: line }] }));
}
