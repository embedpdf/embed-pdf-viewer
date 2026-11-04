import {
  DEFAULT_RICH_TEXT_BODY,
  faceForFontName,
  type DescribeFont,
  type RichTextBody,
  type RichTextDocument,
  type RichTextDocumentInput,
  type RichTextParagraph,
  type RichTextRunStyle,
  toLineBreaks,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readUtf8String } from '../../../runtime/memory/strings';

/**
 * The rich text wire: the engine's `EPDFAnnot_GetRichTextJSON` /
 * `EPDFAnnot_SetRichTextJSON` JSON shape is the DTO shape plus `source` and
 * `diagnostics`, so reading is a parse and writing is a stringify — except
 * for faces. The DTO names a face the way the host does (a registered
 * font's `key`, a standard font's kebab name); the engine names it the way
 * a PDF does (family, weight, italic). Both directions map here, and so do
 * hard line breaks: `\n` in the DTO, `\r` in the engine's JSON, as a PDF
 * spells them.
 */

/** How a write's font names become what the engine draws with. */
export interface RichTextFonts {
  /** The face a name stands for: a registered key's, a document font's. */
  describe?: DescribeFont;
  /** The document program a name names, when new text can be written with it. */
  programOf?: (name: string) => number | undefined;
  /** The body's program: the one the box's `fontFamily` names. */
  bodyProgram?: number;
}

/**
 * A run style or body with its `family` (and the weight/italic a key, a
 * standard name or a document font's name implies) rewritten to what the
 * engine resolves by, and the program a document font's name names: two
 * programs that describe themselves alike are one face, never one program.
 */
function withEngineFace<T extends Partial<RichTextRunStyle>>(
  style: T,
  fonts: RichTextFonts,
): T & { program?: number } {
  if (style.family === undefined) return style;
  const program = fonts.programOf?.(style.family);
  const face = faceForFontName(style.family, fonts.describe);
  const out: T & { program?: number } = { ...style, family: face.family };
  // A name carries its weight and italic; an explicit `weight`/`italic` in
  // the style still wins.
  if (face.weight !== undefined && style.weight === undefined) out.weight = face.weight;
  if (face.italic !== undefined && style.italic === undefined) out.italic = face.italic;
  if (program !== undefined) out.program = program;
  return out;
}

/** The engine's JSON for a write: the input shape with faces resolved. */
export function engineRichTextJson(
  input: RichTextDocumentInput,
  fonts: RichTextFonts = {},
): string {
  const body = input.body ? withEngineFace(input.body, fonts) : undefined;
  if (body && fonts.bodyProgram !== undefined) body.program = fonts.bodyProgram;
  const paragraphs = input.paragraphs.map((p) => ({
    ...p,
    runs: p.runs.map((r) => ({
      ...r,
      text: toLineBreaks(r.text, '\r'),
      ...(r.style ? { style: withEngineFace(r.style, fonts) } : {}),
    })),
  }));
  return JSON.stringify(body ? { body, paragraphs } : { paragraphs });
}

interface EngineRichText {
  source?: string;
  body?: Record<string, unknown>;
  paragraphs?: Array<Record<string, unknown> & { runs?: Array<Record<string, unknown>> }>;
}

/** The engine's JSON, parsed into the DTO shape (its `source` and
 *  `diagnostics` dropped). `null` when it is not what the engine writes. */
export function parseEngineRichText(json: string): RichTextDocument | null {
  return parsedEngineRichText(json)?.document ?? null;
}

/** The engine's JSON as the DTO, and where the engine read it from: `/RC`, or `/Contents`. */
function parsedEngineRichText(
  json: string,
): { source: unknown; document: RichTextDocument } | null {
  let raw: EngineRichText;
  try {
    raw = JSON.parse(json) as EngineRichText;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !raw.body || !Array.isArray(raw.paragraphs)) {
    return null;
  }
  const { source: _source, ...bodyRest } = raw.body as Record<string, unknown> & {
    source?: unknown;
  };
  void _source;
  const body = withLowercaseColor(bodyRest) as unknown as RichTextBody;
  const paragraphs: RichTextParagraph[] = raw.paragraphs.map((p) => {
    const { runs, ...props } = p;
    return {
      ...(props as Partial<RichTextParagraph>),
      runs: (runs ?? []).map((r) => {
        const run = r as { text?: unknown; style?: Record<string, unknown> };
        const text = typeof run.text === 'string' ? toLineBreaks(run.text, '\n') : run.text;
        return (run.style
          ? { ...run, text, style: withLowercaseColor(run.style) }
          : { ...run, text }) as unknown as RichTextParagraph['runs'][number];
      }),
    } as RichTextParagraph;
  });
  return { source: raw.source, document: { body, paragraphs } };
}

/** A style's color as the engine gives every color: `'#rrggbb'`, lowercase. */
function withLowercaseColor(style: Record<string, unknown>): Record<string, unknown> {
  return typeof style.color === 'string' ? { ...style, color: style.color.toLowerCase() } : style;
}

/**
 * A markup annotation's comment as rich text: its `/RC`, `null` when it has
 * none (the engine's model then comes from `/Contents`, which is the plain
 * comment itself). A body that names no family, as Acrobat writes a
 * comment's, reads as the engine's default body's.
 */
export function readCommentRichText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): RichTextDocument | null {
  const json = readUtf8String(mem, (buf, cap) => fn.EPDFAnnot_GetRichTextJSON(annotPtr, buf, cap));
  const read = json ? parsedEngineRichText(json) : null;
  if (read?.source !== 'rc') return null;
  const { body, paragraphs } = read.document;
  return { body: { ...body, family: body.family || DEFAULT_RICH_TEXT_BODY.family }, paragraphs };
}

/** Read an annotation's rich text through `EPDFAnnot_GetRichTextJSON`. */
export function readEngineRichText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): RichTextDocument | null {
  const json = readUtf8String(mem, (buf, cap) => fn.EPDFAnnot_GetRichTextJSON(annotPtr, buf, cap));
  return json ? parseEngineRichText(json) : null;
}
