import {
  EngineError,
  EngineErrorCode,
  richTextPlainText,
  type FontIdentityInfo,
  type FreeTextFont,
  type RichTextBody,
  type RichTextDocument,
  type RichTextDocumentInput,
  type RichTextParagraph,
  type RichTextRunStyle,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { readUtf8String } from '../../../runtime/memory/strings';
import { isStandardFont } from './standardFont';

/**
 * The rich text wire: the engine's `EPDFAnnot_GetRichTextJSON` /
 * `EPDFAnnot_SetRichTextJSON` JSON shape is the DTO shape plus `source` and
 * `diagnostics`, so reading is a parse and writing is a stringify — except
 * for FACES. The DTO names a face the way the host does (a registered
 * font's `key`, a standard font's kebab name); the engine names it the way
 * a PDF does (family, weight, italic). Both directions map here.
 */

export interface FaceRequest {
  family: string;
  weight?: number;
  italic?: boolean;
}

interface StandardFace {
  family: 'Helvetica' | 'Times' | 'Courier' | 'Symbol' | 'ZapfDingbats';
  weight: number;
  italic: boolean;
}

const STANDARD_FACES: Record<StandardFont, StandardFace> = {
  courier: { family: 'Courier', weight: 400, italic: false },
  'courier-bold': { family: 'Courier', weight: 700, italic: false },
  'courier-bold-oblique': { family: 'Courier', weight: 700, italic: true },
  'courier-oblique': { family: 'Courier', weight: 400, italic: true },
  helvetica: { family: 'Helvetica', weight: 400, italic: false },
  'helvetica-bold': { family: 'Helvetica', weight: 700, italic: false },
  'helvetica-bold-oblique': { family: 'Helvetica', weight: 700, italic: true },
  'helvetica-oblique': { family: 'Helvetica', weight: 400, italic: true },
  'times-roman': { family: 'Times', weight: 400, italic: false },
  'times-bold': { family: 'Times', weight: 700, italic: false },
  'times-bold-italic': { family: 'Times', weight: 700, italic: true },
  'times-italic': { family: 'Times', weight: 400, italic: true },
  symbol: { family: 'Symbol', weight: 400, italic: false },
  'zapf-dingbats': { family: 'ZapfDingbats', weight: 400, italic: false },
};

/** Family names compare without case, spaces, hyphens and underscores
 *  (the engine's own rule): "Noto Sans" == "NotoSans" == "noto-sans". */
export function familyKey(family: string): string {
  return family.toLowerCase().replace(/[\s\-_'"]/g, '');
}

const STANDARD_FAMILY_KEYS: Record<string, StandardFace['family']> = {
  helvetica: 'Helvetica',
  arial: 'Helvetica',
  arialmt: 'Helvetica',
  sansserif: 'Helvetica',
  times: 'Times',
  timesroman: 'Times',
  timesnewroman: 'Times',
  timesnewromanpsmt: 'Times',
  serif: 'Times',
  courier: 'Courier',
  couriernew: 'Courier',
  couriernewpsmt: 'Courier',
  monospace: 'Courier',
  symbol: 'Symbol',
  zapfdingbats: 'ZapfDingbats',
  dingbats: 'ZapfDingbats',
};

/**
 * The face a DTO `fontFamily` (or a rich run's `family`) asks for: a
 * standard font's family/weight/italic, a registered key's resolved
 * identity, or — for anything else — the string itself as a family name
 * (a face the document embeds, or one the engine will substitute).
 */
export function faceForFreeTextFont(
  font: FreeTextFont,
  describe?: (fontKey: string) => FontIdentityInfo | undefined,
): FaceRequest {
  if (isStandardFont(font)) {
    const face = STANDARD_FACES[font];
    return { family: face.family, weight: face.weight, italic: face.italic };
  }
  const registered = describe?.(font);
  if (registered) {
    return { family: registered.familyName, weight: registered.weight, italic: registered.italic };
  }
  return { family: font };
}

/**
 * The DTO `fontFamily` for a body face: the registered `key` whose identity
 * matches, else the standard font's kebab name, else the family itself.
 */
export function freeTextFontForFace(
  face: { family: string; weight: number; italic: boolean },
  keyForFace?: (family: string, weight: number, italic: boolean) => string | undefined,
): FreeTextFont {
  const key = keyForFace?.(face.family, face.weight, face.italic);
  if (key !== undefined) return key;
  const standard = STANDARD_FAMILY_KEYS[familyKey(face.family)];
  if (standard) {
    const bold = face.weight >= 600;
    for (const [name, spec] of Object.entries(STANDARD_FACES) as [StandardFont, StandardFace][]) {
      if (spec.family === standard && spec.weight >= 600 === bold && spec.italic === face.italic) {
        return name;
      }
    }
    // Symbol / ZapfDingbats have no bold or italic faces.
    for (const [name, spec] of Object.entries(STANDARD_FACES) as [StandardFont, StandardFace][]) {
      if (spec.family === standard) return name;
    }
  }
  return face.family;
}

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
  const body = bodyRest as unknown as RichTextBody;
  const paragraphs: RichTextParagraph[] = raw.paragraphs.map((p) => {
    const { runs, ...props } = p;
    return {
      ...(props as Partial<RichTextParagraph>),
      runs: (runs ?? []).map((r) => r as unknown as RichTextParagraph['runs'][number]),
    } as RichTextParagraph;
  });
  return { body, paragraphs };
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

/**
 * A draft or patch that carries both `contents` and `richText` must agree:
 * `contents` is the plain projection of the rich text (plan §4.7). A stale
 * DTO echo fails loud here instead of quietly restoring old text.
 */
export function assertRichTextAgreement(input: {
  subtype: string;
  contents?: string | null;
  richText?: RichTextDocumentInput;
}): void {
  if (input.subtype !== 'free-text' || input.richText === undefined) return;
  if (input.contents === undefined || input.contents === null) return;
  if (input.contents !== richTextPlainText(input.richText)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'free-text: `contents` must equal the plain projection of `richText` when both are given',
    );
  }
}
