/**
 * Rich text run algebra — the pure operations an editor needs on a FreeText's
 * rich document (engine `RichTextDocumentInput`): flat offsets over the plain
 * projection, run splitting at a boundary, applying a style delta to a range,
 * and normalisation. No DOM, no engine: the editor binding (in `@embedpdf/web`)
 * maps DOM selections to these offsets and renders the result; the plugin
 * applies these functions and commits.
 *
 * Offsets are positions in the plain projection: paragraphs joined by `\r`,
 * runs concatenated. Every character counts one, including the `\r` a run
 * carries as a hard break and the `\r` that separates two paragraphs.
 */
import type {
  RichTextDocumentInput,
  RichTextParagraph,
  RichTextRun,
  RichTextRunStyle,
} from '@embedpdf/engine-core/runtime';

export type RichTextStyleDelta = Partial<RichTextRunStyle>;

/** A range of the plain projection, `start <= end`, end exclusive. */
export interface RichTextRange {
  start: number;
  end: number;
}

/** Length of the plain projection. */
export function richTextLength(doc: { paragraphs: readonly RichTextParagraph[] }): number {
  let length = 0;
  doc.paragraphs.forEach((paragraph, i) => {
    if (i > 0) length += 1;
    for (const run of paragraph.runs) length += run.text.length;
  });
  return length;
}

const DELTA_KEYS: readonly (keyof RichTextRunStyle)[] = [
  'family',
  'weight',
  'italic',
  'size',
  'color',
  'decoration',
  'script',
  'letterSpacing',
  'horizontalScale',
  'unknown',
];

function sameDecoration(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  const sorted = (values: readonly string[]) => [...values].sort();
  const sa = sorted(left);
  const sb = sorted(right);
  return sa.every((value, i) => value === sb[i]);
}

/** Two deltas override the same properties with the same values. */
export function sameStyleDelta(
  left: RichTextStyleDelta | undefined,
  right: RichTextStyleDelta | undefined,
): boolean {
  const da = left ?? {};
  const db = right ?? {};
  for (const key of DELTA_KEYS) {
    if (key === 'decoration') {
      if (!sameDecoration(da.decoration, db.decoration)) return false;
    } else if (da[key] !== db[key]) {
      return false;
    }
  }
  return true;
}

/** A delta with every `undefined` member removed; `undefined` when empty. */
function cleanDelta(delta: RichTextStyleDelta | undefined): RichTextStyleDelta | undefined {
  if (!delta) return undefined;
  const out: RichTextStyleDelta = {};
  let any = false;
  for (const key of DELTA_KEYS) {
    const value = delta[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Merge adjacent runs whose deltas agree, drop empty runs, strip empty
 * deltas. A paragraph with no text keeps a single empty run so the editor
 * has somewhere to put the caret.
 */
export function normalizeRuns<T extends { paragraphs: RichTextParagraph[] }>(doc: T): T {
  const paragraphs = doc.paragraphs.map((paragraph) => {
    const runs: RichTextRun[] = [];
    for (const run of paragraph.runs) {
      if (run.text.length === 0) continue;
      const style = cleanDelta(run.style);
      const last = runs[runs.length - 1];
      if (last && sameStyleDelta(last.style, style)) {
        runs[runs.length - 1] = { ...last, text: last.text + run.text };
      } else {
        runs.push(style ? { text: run.text, style } : { text: run.text });
      }
    }
    if (runs.length === 0) runs.push({ text: '' });
    return { ...paragraph, runs };
  });
  return { ...doc, paragraphs };
}

/** Where a flat offset falls: paragraph index and offset within it (the
 *  separator between paragraphs belongs to the end of the earlier one). */
export function locateOffset(
  doc: { paragraphs: readonly RichTextParagraph[] },
  offset: number,
): { paragraph: number; offset: number } {
  let pos = 0;
  for (let i = 0; i < doc.paragraphs.length; i++) {
    const length = doc.paragraphs[i]!.runs.reduce((sum, run) => sum + run.text.length, 0);
    if (offset <= pos + length || i === doc.paragraphs.length - 1) {
      return { paragraph: i, offset: Math.max(0, Math.min(length, offset - pos)) };
    }
    pos += length + 1; // the paragraph separator
  }
  return { paragraph: 0, offset: 0 };
}

/** The paragraph with a run boundary guaranteed at a local offset. */
export function splitRunsAt(paragraph: RichTextParagraph, offset: number): RichTextParagraph {
  const runs: RichTextRun[] = [];
  let pos = 0;
  for (const run of paragraph.runs) {
    const end = pos + run.text.length;
    if (offset > pos && offset < end) {
      const cut = offset - pos;
      runs.push({ ...run, text: run.text.slice(0, cut) });
      runs.push({ ...run, text: run.text.slice(cut) });
    } else {
      runs.push(run);
    }
    pos = end;
  }
  return { ...paragraph, runs };
}

/**
 * Apply a style delta to every character of a range: the runs it touches are
 * split at its boundaries, the covered pieces take the delta on top of what
 * they already override (`clear` names properties to stop overriding, so
 * they follow the body again), and the result is normalised. An empty range
 * is a no-op.
 */
export function applyStyleToRange<T extends { paragraphs: RichTextParagraph[] }>(
  doc: T,
  range: RichTextRange,
  delta: RichTextStyleDelta,
  clear: readonly (keyof RichTextRunStyle)[] = [],
): T {
  const start = Math.max(0, Math.min(range.start, range.end));
  const end = Math.max(range.start, range.end);
  if (end <= start) return doc;
  const from = locateOffset(doc, start);
  const to = locateOffset(doc, end);
  const paragraphs = doc.paragraphs.map((paragraph, index) => {
    if (index < from.paragraph || index > to.paragraph) return paragraph;
    const localStart = index === from.paragraph ? from.offset : 0;
    const localEnd =
      index === to.paragraph
        ? to.offset
        : paragraph.runs.reduce((sum, run) => sum + run.text.length, 0);
    if (localEnd <= localStart) return paragraph;
    const split = splitRunsAt(splitRunsAt(paragraph, localStart), localEnd);
    let pos = 0;
    const runs = split.runs.map((run) => {
      const runStart = pos;
      pos += run.text.length;
      if (runStart < localStart || runStart >= localEnd || run.text.length === 0) return run;
      const style: RichTextStyleDelta = { ...(run.style ?? {}), ...delta };
      for (const key of clear) delete (style as Record<string, unknown>)[key];
      return { ...run, style };
    });
    return { ...split, runs };
  });
  return normalizeRuns({ ...doc, paragraphs });
}

/**
 * The delta in force at a caret: the run the offset falls in, or, at a run
 * boundary, the run before it (what typing there would inherit). Undefined
 * for an empty document.
 */
export function styleAt(
  doc: { paragraphs: readonly RichTextParagraph[] },
  offset: number,
): RichTextStyleDelta | undefined {
  const at = locateOffset(doc, offset);
  const paragraph = doc.paragraphs[at.paragraph];
  if (!paragraph) return undefined;
  let pos = 0;
  let previous: RichTextRun | undefined;
  for (const run of paragraph.runs) {
    const end = pos + run.text.length;
    if (at.offset > pos && at.offset <= end) return run.style ?? {};
    if (at.offset === pos && pos === 0) return run.style ?? {};
    previous = run;
    pos = end;
  }
  return previous?.style ?? {};
}

/** Every run overlapping the range satisfies `predicate` (an empty range
 *  tests the caret's style). */
export function rangeHasStyle(
  doc: { paragraphs: readonly RichTextParagraph[] },
  range: RichTextRange,
  predicate: (delta: RichTextStyleDelta) => boolean,
): boolean {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (end <= start) return predicate(styleAt(doc, start) ?? {});
  const from = locateOffset(doc, start);
  const to = locateOffset(doc, end);
  let any = false;
  for (let index = from.paragraph; index <= to.paragraph; index++) {
    const paragraph = doc.paragraphs[index]!;
    const localStart = index === from.paragraph ? from.offset : 0;
    const localEnd =
      index === to.paragraph
        ? to.offset
        : paragraph.runs.reduce((sum, run) => sum + run.text.length, 0);
    let pos = 0;
    for (const run of paragraph.runs) {
      const runEnd = pos + run.text.length;
      if (runEnd > localStart && pos < localEnd && run.text.length > 0) {
        any = true;
        if (!predicate(run.style ?? {})) return false;
      }
      pos = runEnd;
    }
  }
  return any;
}

/** Plain paragraphs from text: one per line break, one unstyled run each. */
export function paragraphsFromPlainText(text: string): RichTextParagraph[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({ runs: [{ text: line }] }));
}

/** The plain projection: paragraphs joined by `\r`, runs concatenated. */
export function plainTextOf(doc: { paragraphs: readonly RichTextParagraph[] }): string {
  return doc.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
    .join('\r');
}

/** True when nothing in the document overrides the body: no run delta, no
 *  paragraph property. Such a document commits as plain `contents`. */
export function isPlainRichText(doc: RichTextDocumentInput): boolean {
  if (doc.body && Object.keys(doc.body).length > 0) return false;
  return doc.paragraphs.every(
    (paragraph) =>
      paragraph.align === undefined &&
      paragraph.dir === undefined &&
      paragraph.lineHeight === undefined &&
      paragraph.margins === undefined &&
      paragraph.textIndent === undefined &&
      paragraph.unknown === undefined &&
      paragraph.runs.every((run) => cleanDelta(run.style) === undefined),
  );
}
