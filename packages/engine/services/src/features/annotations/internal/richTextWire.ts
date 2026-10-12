import {
  faceForFreeTextFont,
  type FontIdentityInfo,
  type RichTextBody,
  type RichTextDocument,
  type RichTextDocumentInput,
  type RichTextParagraph,
  type RichTextRunStyle,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readUtf8String } from '../../../runtime/memory/strings';

/**
 * The rich text wire: the engine's `EPDFAnnot_GetRichTextJSON` /
 * `EPDFAnnot_SetRichTextJSON` JSON shape is the DTO shape plus `source` and
 * `diagnostics`, so reading is a parse and writing is a stringify — except
 * for faces. The DTO names a face the way the host does (a registered
 * font's `key`, a standard font's kebab name); the engine names it the way
 * a PDF does (family, weight, italic). Both directions map here.
 */

/** A run style or body with its `family` (and the weight/italic a key or
 *  standard name implies) rewritten to what the engine resolves by. */
function withEngineFace<T extends Partial<RichTextRunStyle>>(
  style: T,
  describe?: (fontKey: string) => FontIdentityInfo | undefined,
): T {
  if (style.family === undefined) return style;
  const face = faceForFreeTextFont(style.family, describe);
  const out: T = { ...style, family: face.family };
  // A key or a standard name carries its weight and italic; an explicit
  // `weight`/`italic` in the style still wins.
  if (face.weight !== undefined && style.weight === undefined) out.weight = face.weight;
  if (face.italic !== undefined && style.italic === undefined) out.italic = face.italic;
  return out;
}

/** The engine's JSON for a write: the input shape with faces resolved. */
export function engineRichTextJson(
  input: RichTextDocumentInput,
  describe?: (fontKey: string) => FontIdentityInfo | undefined,
): string {
  const body = input.body ? withEngineFace(input.body, describe) : undefined;
  const paragraphs = input.paragraphs.map((p) => ({
    ...p,
    runs: p.runs.map((r) => (r.style ? { ...r, style: withEngineFace(r.style, describe) } : r)),
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
        const run = r as { style?: Record<string, unknown> };
        return (run.style
          ? { ...run, style: withLowercaseColor(run.style) }
          : run) as unknown as RichTextParagraph['runs'][number];
      }),
    } as RichTextParagraph;
  });
  return { body, paragraphs };
}

/** A style's color as the engine gives every color: `'#rrggbb'`, lowercase. */
function withLowercaseColor(style: Record<string, unknown>): Record<string, unknown> {
  return typeof style.color === 'string' ? { ...style, color: style.color.toLowerCase() } : style;
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
