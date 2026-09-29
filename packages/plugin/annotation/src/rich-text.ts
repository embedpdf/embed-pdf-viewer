/**
 * Rich text policy — what the annotation plugin decides about a free-text
 * annotation's rich document, kept pure so every framework's editor glue
 * behaves identically (the mechanics live in `@embedpdf/web`'s binding; the
 * run algebra, an annotation's rich document and a font's face in the core):
 *
 *   • a flat props patch → the run delta it means for a text range (font,
 *     size, colour, bold/italic/underline) and the keys left for the body
 *   • what a range reads back for those keys (agree → the value, else mixed)
 *   • faces: the DTO font a face names, and a CSS family list for either
 *   • the commit rule: a document nothing overrides on a plain annotation
 *     commits as `contents`; anything else as `richText`
 */
import {
  faceForFont,
  fieldsOf,
  locateOffset,
  richDocOf,
  type FieldValues,
  type FontLookup,
  type ModelAnnotation,
  type RichTextRange,
  type RichTextStyleDelta,
} from '@embedpdf/core-annotation';
import {
  isStandardFontName,
  STANDARD_FACES,
  type RichTextBody,
  type RichTextDocument,
  type RichTextParagraph,
  type RichTextRunStyle,
} from '@embedpdf/engine-core/runtime';

export type TextFormat = 'bold' | 'italic' | 'underline';

/** The editor's selection inside one free-text annotation: flat offsets over
 *  the plain projection (paragraphs joined by `\r`). */
export interface TextSelection extends RichTextRange {
  id: string;
}

/** The face a run or a body names. */
export interface Face {
  family: string;
  weight?: number;
  italic?: boolean;
}

/** The fields a text range takes as run deltas: its font, size and colour, and the formats. */
export const RANGE_KEYS: readonly string[] = [
  'fontFamily',
  'fontSize',
  'fontColor',
  'bold',
  'italic',
  'underline',
];

// ---- Faces ---------------------------------------------------------------------

type StandardFamily = (typeof STANDARD_FACES)[keyof typeof STANDARD_FACES]['family'];

/** Family names compare without case, spaces, hyphens, underscores and
 *  quotes — the engine's own rule. */
export function familyKey(family: string): string {
  return family.toLowerCase().replace(/[\s\-_'"]/g, '');
}

const STANDARD_FAMILY_KEYS: Record<string, StandardFamily> = {
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

/** Web stacks with the standard families' metrics (what the DOM editor and
 *  the vector renderer show for text the engine sets in a standard font). */
const STANDARD_STACKS: Record<StandardFamily, string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  Symbol: 'serif',
  ZapfDingbats: 'serif',
};

/** The DTO font for a face: the registered key whose identity matches (the
 *  closest weight, italic first), else the standard kebab name, else the
 *  family itself. The inverse of {@link faceForFont}. */
export function fontForFace(face: Face, fonts?: FontLookup): string {
  const wanted = familyKey(face.family);
  const weight = face.weight ?? 400;
  const italic = face.italic ?? false;
  let best: { key: string; score: number } | undefined;
  for (const handle of fonts?.() ?? []) {
    if (familyKey(handle.familyName) !== wanted) continue;
    const score = Math.abs(handle.weight - weight) + (handle.italic === italic ? 0 : 1000);
    if (!best || score < best.score) best = { key: handle.key, score };
  }
  if (best) return best.key;
  const standard = STANDARD_FAMILY_KEYS[wanted];
  if (standard) {
    const bold = weight >= 600;
    for (const [name, spec] of Object.entries(STANDARD_FACES)) {
      if (spec.family === standard && spec.weight >= 600 === bold && spec.italic === italic) {
        return name;
      }
    }
    for (const [name, spec] of Object.entries(STANDARD_FACES)) {
      if (spec.family === standard) return name; // Symbol/ZapfDingbats: one face
    }
  }
  return face.family;
}

/** The CSS family list for a face family: a standard family's web stack, a
 *  registered family's `@font-face` name (its key — see `mountWebFont`),
 *  else the family itself with a generic fallback. */
export function cssFontFamilyForFace(family: string, fonts?: FontLookup): string {
  const standard = STANDARD_FAMILY_KEYS[familyKey(family)];
  if (standard) return STANDARD_STACKS[standard];
  const wanted = familyKey(family);
  const registered = fonts?.().find((handle) => familyKey(handle.familyName) === wanted);
  if (registered) return `"${registered.key}"`;
  return `"${family}", sans-serif`;
}

/** The CSS family list for a DTO font (a standard kebab name or a key). */
export function cssFontFamilyForFont(font: string, fonts?: FontLookup): string {
  if (isStandardFontName(font)) return STANDARD_STACKS[STANDARD_FACES[font].family];
  return `"${font}", sans-serif`;
}

// ---- Documents -----------------------------------------------------------------

const hex = (css: string): string => css.trim().toUpperCase();

/**
 * The write a text edit commits: the rich paragraphs, with paragraph
 * properties equal to the body's stripped (they are inherited, not
 * overrides) and the body omitted — it stays what the props path last
 * wrote. One engine, one path: plain and formatted text alike.
 */
export function textCommitPatch(
  annotation: ModelAnnotation,
  paragraphs: RichTextParagraph[],
  fonts?: FontLookup,
): { richText: { paragraphs: RichTextParagraph[] } } {
  return {
    richText: {
      paragraphs: stripBodyDefaults(paragraphs, richDocOf(fieldsOf(annotation), fonts).body),
    },
  };
}

/**
 * Paragraph alignment/direction equal to the body's are not overrides: the
 * engine echoes them resolved, the editor renders them as inline styles and
 * serialises them back, and the commit rule must see through that (a plain
 * `/Contents` annotation must not grow an `/RC` from typing).
 */
export function stripBodyDefaults(
  paragraphs: RichTextParagraph[],
  body: Pick<RichTextBody, 'align' | 'dir'>,
): RichTextParagraph[] {
  return paragraphs.map((paragraph) => {
    if (
      (paragraph.align === undefined || paragraph.align !== body.align) &&
      (paragraph.dir === undefined || paragraph.dir !== body.dir)
    ) {
      return paragraph;
    }
    const { align, dir, ...rest } = paragraph;
    return {
      ...rest,
      ...(align !== undefined && align !== body.align ? { align } : {}),
      ...(dir !== undefined && dir !== body.dir ? { dir } : {}),
    };
  });
}

// ---- Props ↔ runs --------------------------------------------------------------

/**
 * Split a patch for an annotation whose editor holds a text range: the run
 * delta the range takes (font → face, size, colour, and the formats: bold →
 * weight, italic, underline → decoration) and the fields that still go to the
 * annotation.
 */
export function runDeltaForFields(
  patch: FieldValues,
  fonts?: FontLookup,
): { delta: RichTextStyleDelta; rest: Record<string, unknown> } {
  const delta: RichTextStyleDelta = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    switch (key) {
      case 'fontFamily': {
        const face = faceForFont(value as string, fonts);
        delta.family = face.family;
        if (face.weight !== undefined) delta.weight = face.weight;
        if (face.italic !== undefined) delta.italic = face.italic;
        break;
      }
      case 'fontSize':
        delta.size = value as number;
        break;
      case 'fontColor':
        delta.color = hex(value as string);
        break;
      case 'bold':
        delta.weight = value ? 700 : 400;
        break;
      case 'italic':
        delta.italic = value as boolean;
        break;
      case 'underline':
        delta.decoration = value ? ['underline'] : [];
        break;
      default:
        rest[key] = value;
    }
  }
  return { delta, rest };
}

/** The style deltas of every non-empty run a range overlaps. */
export function runsInRange(
  doc: { paragraphs: readonly RichTextParagraph[] },
  range: RichTextRange,
): RichTextStyleDelta[] {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (end <= start) return [];
  const from = locateOffset(doc, start);
  const to = locateOffset(doc, end);
  const out: RichTextStyleDelta[] = [];
  for (let index = from.paragraph; index <= to.paragraph; index++) {
    const paragraph = doc.paragraphs[index]!;
    const localStart = index === from.paragraph ? from.offset : 0;
    const localEnd =
      index === to.paragraph
        ? to.offset
        : paragraph.runs.reduce((total, run) => total + run.text.length, 0);
    let pos = 0;
    for (const run of paragraph.runs) {
      const runEnd = pos + run.text.length;
      if (runEnd > localStart && pos < localEnd && run.text.length > 0) out.push(run.style ?? {});
      pos = runEnd;
    }
  }
  return out;
}

/** The values a range reads back for the range keys — resolved against the
 *  body, one value where every run agrees, `mixed` where they don't. */
export function rangeProps(
  doc: RichTextDocument,
  range: RichTextRange,
  fonts?: FontLookup,
): { values: Record<string, unknown>; mixed: string[] } {
  const runs = runsInRange(doc, range);
  const body = doc.body;
  const resolve = (delta: RichTextStyleDelta): Partial<RichTextRunStyle> => ({
    family: delta.family ?? body.family,
    weight: delta.weight ?? body.weight,
    italic: delta.italic ?? body.italic,
    size: delta.size ?? body.size,
    color: delta.color ?? body.color,
    decoration: delta.decoration ?? body.decoration,
  });
  const styles = (runs.length ? runs : [{}]).map(resolve);
  const values: Record<string, unknown> = {};
  const mixed: string[] = [];
  const read = (key: string, of: (style: Partial<RichTextRunStyle>) => unknown) => {
    const first = of(styles[0]!);
    values[key] = first;
    if (styles.some((style) => JSON.stringify(of(style)) !== JSON.stringify(first)))
      mixed.push(key);
  };
  // The family reads back at the body's weight/italic: a run's own weight
  // and italic are the bold/italic toggles, not a different font ("Helvetica"
  // stays "helvetica" while bold, never flips to "helvetica-bold").
  read('fontFamily', (style) =>
    fontForFace({ family: style.family!, weight: body.weight, italic: body.italic }, fonts),
  );
  read('fontSize', (style) => style.size);
  read('fontColor', (style) => style.color!.toLowerCase());
  read('bold', (style) => (style.weight ?? 400) >= 600);
  read('italic', (style) => !!style.italic);
  read('underline', (style) => (style.decoration ?? []).includes('underline'));
  return { values, mixed };
}
