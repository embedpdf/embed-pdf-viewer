/**
 * Rich text POLICY — what the annotation plugin decides about a free-text
 * annotation's rich document, kept pure so every framework's editor glue
 * behaves identically (the mechanics live in `@embedpdf/web`'s binding, the
 * run algebra in the core):
 *
 *   • the rich document of any annot (the DTO's, or one synthesised from the
 *     plain text + the `/DA` text style for a draft that has no DTO yet)
 *   • a flat props patch → the run delta it means for a text RANGE (font,
 *     size, colour, bold/italic/underline) and the keys left for the body
 *   • what a range reads back for those keys (agree → the value, else mixed)
 *   • faces: a DTO font (standard kebab name / registered key) ↔ the face a
 *     run names (family + weight + italic) ↔ a CSS family list
 *   • the commit rule: a document nothing overrides on a plain annotation
 *     commits as `contents`; anything else as `richText`
 */
import {
  locateOffset,
  paragraphsFromPlainText,
  type Annot,
  type AnnotationPropsPatch,
  type PropKey,
  type RichTextRange,
  type RichTextStyleDelta,
  type TextStyle,
} from '@embedpdf/core-annotation';
import type {
  FontHandle,
  RichTextBody,
  RichTextDocument,
  RichTextParagraph,
  RichTextRunStyle,
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

/** The props keys a text range takes as run deltas. */
export const RANGE_KEYS: readonly PropKey[] = [
  'fontFamily',
  'fontSize',
  'fontColor',
  'bold',
  'italic',
  'underline',
];

// ---- Faces ---------------------------------------------------------------------

type StandardFamily = 'Helvetica' | 'Times' | 'Courier' | 'Symbol' | 'ZapfDingbats';
interface StandardFace {
  family: StandardFamily;
  weight: number;
  italic: boolean;
}

/** The engine's standard-14 vocabulary (the `StandardFont` kebab names). */
const STANDARD_FACES: Record<string, StandardFace> = {
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

/** The registered fonts an engine knows (the local engine's `fonts.list()`;
 *  none on the cloud engine). */
export type FontLookup = () => readonly FontHandle[];

/** The face a DTO font names: a standard font's family/weight/italic, a
 *  registered key's identity, else the string itself as a family. */
export function faceForFont(font: string, fonts?: FontLookup): Face {
  const standard = STANDARD_FACES[font];
  if (standard) return { ...standard };
  const registered = fonts?.().find((f) => f.key === font);
  if (registered) {
    return { family: registered.familyName, weight: registered.weight, italic: registered.italic };
  }
  return { family: font };
}

/** The DTO font for a face: the registered key whose identity matches (the
 *  closest weight, italic first), else the standard kebab name, else the
 *  family itself. The inverse of {@link faceForFont}. */
export function fontForFace(face: Face, fonts?: FontLookup): string {
  const wanted = familyKey(face.family);
  const weight = face.weight ?? 400;
  const italic = face.italic ?? false;
  let best: { key: string; score: number } | undefined;
  for (const f of fonts?.() ?? []) {
    if (familyKey(f.familyName) !== wanted) continue;
    const score = Math.abs(f.weight - weight) + (f.italic === italic ? 0 : 1000);
    if (!best || score < best.score) best = { key: f.key, score };
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
  const registered = fonts?.().find((f) => familyKey(f.familyName) === wanted);
  if (registered) return `"${registered.key}"`;
  return `"${family}", sans-serif`;
}

/** The CSS family list for a DTO font (a standard kebab name or a key). */
export function cssFontFamilyForFont(font: string, fonts?: FontLookup): string {
  const standard = STANDARD_FACES[font];
  if (standard) return STANDARD_STACKS[standard.family];
  return `"${font}", sans-serif`;
}

// ---- Documents -----------------------------------------------------------------

const hex = (css: string): string => css.trim().toUpperCase();

/** The rich body the `/DA` text style describes (a draft's body before its
 *  DTO exists; also the fallback for a DTO without `richText`). */
export function bodyFromTextStyle(t: TextStyle, fonts?: FontLookup): RichTextBody {
  const face = faceForFont(t.fontFamily, fonts);
  return {
    family: face.family,
    weight: t.bold ? 700 : (face.weight ?? 400),
    italic: t.italic ?? face.italic ?? false,
    size: t.fontSize,
    color: hex(t.fontColor),
    decoration: t.underline ? ['underline'] : [],
    script: 'normal',
    letterSpacing: 0,
    horizontalScale: 1,
    align: t.textAlign,
    dir: 'ltr',
  };
}

/** The annotation's rich document: the DTO's, else one synthesised from
 *  its plain text and text style (a draft the engine has not echoed yet). */
export function richDocOf(a: Annot, fonts?: FontLookup): RichTextDocument {
  if (a.data?.subtype === 'free-text' && a.data.richText) return a.data.richText;
  const t: TextStyle = a.text ?? {
    fontFamily: 'helvetica',
    fontSize: 12,
    fontColor: '#000000',
    textAlign: 'left',
  };
  return {
    body: bodyFromTextStyle(t, fonts),
    paragraphs: paragraphsFromPlainText(a.data?.contents ?? ''),
  };
}

/**
 * The write a text edit commits: the rich paragraphs, with paragraph
 * properties equal to the body's stripped (they are inherited, not
 * overrides) and the body omitted — it stays what the props path last
 * wrote. One engine, one path: plain and formatted text alike.
 */
export function textCommitPatch(
  a: Annot,
  paragraphs: RichTextParagraph[],
  fonts?: FontLookup,
): { richText: { paragraphs: RichTextParagraph[] } } {
  return { richText: { paragraphs: stripBodyDefaults(paragraphs, richDocOf(a, fonts).body) } };
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
  return paragraphs.map((p) => {
    if (
      (p.align === undefined || p.align !== body.align) &&
      (p.dir === undefined || p.dir !== body.dir)
    ) {
      return p;
    }
    const { align, dir, ...rest } = p;
    return {
      ...rest,
      ...(align !== undefined && align !== body.align ? { align } : {}),
      ...(dir !== undefined && dir !== body.dir ? { dir } : {}),
    };
  });
}

// ---- Props ↔ runs --------------------------------------------------------------

/**
 * Split a props patch for an annotation whose editor holds a text RANGE:
 * the run delta the range takes (font → face, size, colour, bold → weight,
 * italic, underline → decoration) and the keys that still go to the body.
 */
export function runDeltaForProps(
  patch: AnnotationPropsPatch,
  fonts?: FontLookup,
): { delta: RichTextStyleDelta; rest: AnnotationPropsPatch } {
  const delta: RichTextStyleDelta = {};
  const rest: AnnotationPropsPatch = {};
  for (const key of Object.keys(patch) as PropKey[]) {
    const value = patch[key];
    if (value === undefined) continue;
    switch (key) {
      case 'fontFamily': {
        const face = faceForFont(patch.fontFamily!, fonts);
        delta.family = face.family;
        if (face.weight !== undefined) delta.weight = face.weight;
        if (face.italic !== undefined) delta.italic = face.italic;
        break;
      }
      case 'fontSize':
        delta.size = patch.fontSize;
        break;
      case 'fontColor':
        delta.color = hex(patch.fontColor!);
        break;
      case 'bold':
        delta.weight = patch.bold ? 700 : 400;
        break;
      case 'italic':
        delta.italic = patch.italic;
        break;
      case 'underline':
        delta.decoration = patch.underline ? ['underline'] : [];
        break;
      default:
        (rest as Record<string, unknown>)[key] = value;
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
      index === to.paragraph ? to.offset : paragraph.runs.reduce((n, r) => n + r.text.length, 0);
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
): { values: Partial<Record<PropKey, unknown>>; mixed: PropKey[] } {
  const runs = runsInRange(doc, range);
  const body = doc.body;
  const resolve = (d: RichTextStyleDelta): Partial<RichTextRunStyle> => ({
    family: d.family ?? body.family,
    weight: d.weight ?? body.weight,
    italic: d.italic ?? body.italic,
    size: d.size ?? body.size,
    color: d.color ?? body.color,
    decoration: d.decoration ?? body.decoration,
  });
  const styles = (runs.length ? runs : [{}]).map(resolve);
  const values: Partial<Record<PropKey, unknown>> = {};
  const mixed: PropKey[] = [];
  const read = (key: PropKey, of: (s: Partial<RichTextRunStyle>) => unknown) => {
    const first = of(styles[0]!);
    values[key] = first;
    if (styles.some((s) => JSON.stringify(of(s)) !== JSON.stringify(first))) mixed.push(key);
  };
  // The family reads back at the BODY's weight/italic: a run's own weight
  // and italic are the bold/italic toggles, not a different font ("Helvetica"
  // stays "helvetica" while bold, never flips to "helvetica-bold").
  read('fontFamily', (s) =>
    fontForFace({ family: s.family!, weight: body.weight, italic: body.italic }, fonts),
  );
  read('fontSize', (s) => s.size);
  read('fontColor', (s) => s.color!.toLowerCase());
  read('bold', (s) => (s.weight ?? 400) >= 600);
  read('italic', (s) => !!s.italic);
  read('underline', (s) => (s.decoration ?? []).includes('underline'));
  return { values, mixed };
}
