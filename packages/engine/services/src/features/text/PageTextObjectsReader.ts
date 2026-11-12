import type {
  PageContentMark,
  PageContentObject,
  PageContentObjectKind,
  PageObjectNumber,
  PageTextFont,
  PageTextGlyph,
  PageTextObjectsSnapshot,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { readF32, readI32 } from '../../runtime/memory/structs';
import { withScratch } from '../../runtime/memory/scratch';
import { readUtf16String } from '../../runtime/memory/strings';
import { throwIfAborted } from '../../shared/abort';
import { SliceTimer, type Slices } from '../../shared/slices';

/** `FPDF_PAGEOBJ_*` */
const OBJECT_KINDS: Record<number, PageContentObjectKind> = {
  1: 'text',
  2: 'path',
  3: 'image',
  4: 'shading',
};
const FPDF_PAGEOBJ_FORM = 5;

/** Font descriptor `/Flags` bits. */
const FLAG_FIXED_PITCH = 1;
const FLAG_SERIF = 2;

/** Char codes probed to tell whether every glyph width of a font is the same. */
const WIDTH_PROBE_CODES = 1024;

/** Brackets a right-to-left text page shows mirrored. */
const MIRRORED: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
  '‹': '›',
  '›': '‹',
};

const isSpace = (text: string) => /^\s$/.test(text);

/** Strong right-to-left characters (Hebrew, Arabic and their presentation forms). */
const isRtlCodePoint = (u: number) =>
  (u >= 0x590 && u <= 0x8ff) || (u >= 0xfb1d && u <= 0xfdff) || (u >= 0xfe70 && u <= 0xfeff);

interface RawObject {
  handle: Ptr;
  type: number;
  marks: number[];
}

/** A text page character, as `drawingOrder` takes it. */
export interface TextObjectChar {
  index: number;
  unicode: string;
  x: number;
  y: number;
  /** Loose cell width, shear removed. */
  width: number;
}

/**
 * Object-level page text: every page object in content order with its
 * marked-content stack, and each text object's font, matrix and glyphs in
 * drawing order.
 *
 * Objects come from the page's object list (form XObjects flattened in
 * place); glyphs come from the text page, matched to their object through
 * `FPDFText_GetTextObject`. The text page keeps right-to-left lines in
 * logical order with brackets mirrored, so each object's glyphs are put back
 * in pen order along the object's baseline and mirrored brackets restored.
 */
export class PageTextObjectsReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  async read(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<PageTextObjectsSnapshot> {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = await pool.acquireInSlices(pageObjectNumber, signal, slices);
    try {
      throwIfAborted(signal);
      const textPagePtr = fn.FPDFText_LoadPage(pagePtr);
      if (!textPagePtr) {
        throw new EngineError(
          EngineErrorCode.RuntimeUnavailable,
          `FPDFText_LoadPage returned null for page object ${pageObjectNumber}`,
        );
      }
      try {
        const timer = new SliceTimer(slices, signal);
        const marks: PageContentMark[] = [];
        const raw: RawObject[] = [];
        this.collect(
          fn.FPDFPage_CountObjects(pagePtr),
          (i) => fn.FPDFPage_GetObject(pagePtr, i),
          [],
          new Map(),
          marks,
          raw,
        );
        const charsByObject = await this.readChars(textPagePtr, timer);
        const fonts: PageTextFont[] = [];
        const fontIndex = new Map<number | bigint, number>();
        const objects: PageContentObject[] = [];
        for (const object of raw) {
          if (timer.due) await timer.pause();
          const kind = OBJECT_KINDS[object.type] ?? 'unknown';
          if (kind !== 'text') {
            objects.push({ kind, marks: object.marks });
            continue;
          }
          const chars = charsByObject.chars.get(object.handle) ?? [];
          const fontPtr = fn.FPDFTextObj_GetFont(object.handle);
          let font = fontIndex.get(fontPtr);
          if (font === undefined) {
            font = fonts.length;
            fontIndex.set(fontPtr, font);
            fonts.push(this.readFont(fontPtr, charsByObject.uniformWidths.get(fontPtr) ?? false));
          }
          const fontSize = withScratch(this.runtime.mem, 4, (ptr) =>
            fn.FPDFTextObj_GetFontSize(object.handle, ptr) ? readF32(this.runtime.mem, ptr) : 1,
          );
          const matrix = withScratch(this.runtime.mem, 24, (ptr) =>
            fn.FPDFPageObj_GetMatrix(object.handle, ptr)
              ? ([0, 1, 2, 3, 4, 5].map((k) => readF32(this.runtime.mem, ptr, k * 4)) as [
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                ])
              : ([1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number]),
          );
          const { glyphs, reversed } = drawingOrder(chars, matrix, charsByObject.lineRtl);
          objects.push({
            kind: 'text',
            marks: object.marks,
            font,
            fontSize,
            matrix,
            ...(reversed ? { reversed: true as const } : {}),
            glyphs,
          });
        }
        return { objects, marks, fonts };
      } finally {
        fn.FPDFText_ClosePage(textPagePtr);
      }
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  /** Flatten the object tree in content order, resolving each object's mark stack. */
  private collect(
    count: number,
    objectAt: (i: number) => Ptr,
    inherited: number[],
    markIds: Map<number | bigint, number>,
    marks: PageContentMark[],
    out: RawObject[],
  ): void {
    const { fn } = this.runtime;
    for (let i = 0; i < count; i++) {
      const handle = objectAt(i);
      const type = fn.FPDFPageObj_GetType(handle);
      const stack = [...inherited];
      const markCount = fn.FPDFPageObj_CountMarks(handle);
      for (let m = 0; m < markCount; m++) {
        const markPtr = fn.FPDFPageObj_GetMark(handle, m);
        let id = markIds.get(markPtr);
        if (id === undefined) {
          id = marks.length;
          markIds.set(markPtr, id);
          marks.push(this.readMark(markPtr));
        }
        stack.push(id);
      }
      if (type === FPDF_PAGEOBJ_FORM) {
        this.collect(
          fn.FPDFFormObj_CountObjects(handle),
          (j) => fn.FPDFFormObj_GetObject(handle, j),
          stack,
          markIds,
          marks,
          out,
        );
      } else {
        out.push({ handle, type, marks: stack });
      }
    }
  }

  private readMark(markPtr: Ptr): PageContentMark {
    const { fn, mem } = this.runtime;
    const tag =
      withScratch(mem, 8, (lenPtr) =>
        readUtf16String(mem, (buf, capacity) =>
          fn.FPDFPageObjMark_GetName(markPtr, buf, capacity, lenPtr) ? readI32(mem, lenPtr) : 0,
        ),
      ) ?? '';
    const mcid = withScratch(mem, 4, (ptr) =>
      fn.FPDFPageObjMark_GetParamIntValue(markPtr, 'MCID', ptr) ? readI32(mem, ptr) : undefined,
    );
    return mcid === undefined ? { tag } : { tag, mcid };
  }

  /**
   * The text page's characters grouped by text object, each line's base
   * direction, and per font whether the cells it draws on this page are all
   * one width (the fallback when its glyph widths can't be probed).
   */
  private async readChars(textPagePtr: Ptr, timer: SliceTimer) {
    const { fn, mem } = this.runtime;
    const count = Math.max(fn.FPDFText_CountChars(textPagePtr), 0);
    const lineRtl: boolean[] = new Array(count);
    const codePoints = new Array<number>(count);
    let lineStart = 0;
    let rtl = false;
    for (let i = 0; i <= count; i++) {
      const u = i < count ? (codePoints[i] = fn.FPDFText_GetUnicode(textPagePtr, i)) : 10;
      if (u === 10 || u === 13) {
        for (let j = lineStart; j <= i && j < count; j++) lineRtl[j] = rtl;
        lineStart = i + 1;
        rtl = false;
      } else if (isRtlCodePoint(u)) {
        rtl = true;
      }
    }
    const chars = new Map<number | bigint, TextObjectChar[]>();
    const widthsByFont = new Map<number | bigint, Set<number>>();
    const [xPtr, yPtr, rectPtr, matrixPtr] = [8, 8, 16, 24].map((bytes) => mem.alloc(bytes));
    // Consecutive characters mostly share a text object: its font and slant are read once.
    let lastObject: Ptr | undefined;
    let fontPtr: Ptr = 0n as Ptr;
    let slant = 0;
    try {
      for (let i = 0; i < count; i++) {
        // Checking the clock per character costs more than the character's own reads.
        if ((i & 63) === 0 && timer.due) await timer.pause();
        if (fn.FPDFText_IsGenerated(textPagePtr, i) === 1) continue;
        const object = fn.FPDFText_GetTextObject(textPagePtr, i);
        if (!object) continue;
        if (object !== lastObject) {
          lastObject = object;
          fontPtr = fn.FPDFTextObj_GetFont(object);
          slant = 0;
          if (fn.FPDFPageObj_GetMatrix(object, matrixPtr)) {
            const c = readF32(mem, matrixPtr, 8);
            const d = readF32(mem, matrixPtr, 12);
            if (c && d) slant = Math.abs(c / d);
          }
        }
        const unicode = String.fromCodePoint(codePoints[i]);
        fn.FPDFText_GetCharOrigin(textPagePtr, i, xPtr, yPtr);
        fn.FPDFText_GetLooseCharBox(textPagePtr, i, rectPtr);
        // FS_RECTF { left, top, right, bottom }
        const left = readF32(mem, rectPtr, 0);
        const top = readF32(mem, rectPtr, 4);
        const right = readF32(mem, rectPtr, 8);
        const bottom = readF32(mem, rectPtr, 12);
        let width = right - left;
        if (width > 0 && !isSpace(unicode)) {
          const fontSize = fn.FPDFText_GetFontSize(textPagePtr, i) || 1;
          const set = widthsByFont.get(fontPtr) ?? new Set<number>();
          set.add(Math.round((width / fontSize) * 1000));
          widthsByFont.set(fontPtr, set);
        }
        // Sheared text: the loose box bounds the slanted cell; remove the slant.
        if (slant) width = Math.max(0, width - slant * Math.abs(top - bottom));
        const entry: TextObjectChar = {
          index: i,
          unicode,
          x: Number(mem.peek(xPtr, 'f64')),
          y: Number(mem.peek(yPtr, 'f64')),
          width,
        };
        const list = chars.get(object);
        if (list) list.push(entry);
        else chars.set(object, [entry]);
      }
    } finally {
      for (const ptr of [matrixPtr, rectPtr, yPtr, xPtr]) mem.free(ptr);
    }
    const uniformWidths = new Map<number | bigint, boolean>();
    for (const [font, set] of widthsByFont) uniformWidths.set(font, set.size === 1);
    return { chars, lineRtl, uniformWidths };
  }

  private readFont(fontPtr: Ptr, uniformCells: boolean): PageTextFont {
    const { fn, mem } = this.runtime;
    const flags = fn.FPDFFont_GetFlags(fontPtr);
    const baseName =
      withScratch(mem, 512, (buf) =>
        fn.FPDFFont_GetBaseFontName(fontPtr, buf, 512) > 0 ? mem.readU8String(buf) : '',
      ) ?? '';
    const [ascent, descent] = withScratch(mem, 4, (ptr) => [
      fn.FPDFFont_GetAscent(fontPtr, 1, ptr) ? readF32(mem, ptr) : 0,
      fn.FPDFFont_GetDescent(fontPtr, 1, ptr) ? readF32(mem, ptr) : 0,
    ]);
    let monospace = (flags & FLAG_FIXED_PITCH) !== 0;
    if (!monospace) {
      // Every non-zero glyph width equal makes a font fixed pitch, as viewers
      // derive it from /Widths; with no width to probe, judge by the cells.
      const widths = new Set<number>();
      withScratch(mem, 4, (ptr) => {
        for (let code = 0; code < WIDTH_PROBE_CODES && widths.size < 2; code++) {
          if (!fn.FPDFFont_GetGlyphWidth(fontPtr, code, 1, ptr)) continue;
          const width = Math.round(readF32(mem, ptr) * 1000);
          if (width) widths.add(width);
        }
      });
      monospace = widths.size === 1 || (widths.size === 0 && uniformCells);
    }
    return { baseName, flags, ascent, descent, monospace, serif: (flags & FLAG_SERIF) !== 0 };
  }
}

/**
 * Put an object's characters in drawing order. Pure — exported for tests.
 *
 * Order is along the object's baseline. A right-to-left object (the text page
 * stored it reversed, or it sits on a right-to-left line with no advance to
 * tell) breaks ties in reverse, draws its logically trailing spaces first and
 * leading ones last, and has its mirrored brackets restored. An object whose
 * glyphs all share one pen position keeps the text page's order (reversed
 * for right-to-left) and marks them `stacked`.
 */
export function drawingOrder(
  chars: readonly TextObjectChar[],
  matrix: readonly number[],
  lineRtl: readonly boolean[],
): { glyphs: PageTextGlyph[]; reversed: boolean } {
  if (chars.length === 0) return { glyphs: [], reversed: false };
  const [ax, ay] = matrix;
  const along = (c: TextObjectChar) => c.x * ax + c.y * ay;
  const solid = chars.filter((c) => !isSpace(c.unicode));
  let direction = 0;
  for (let k = 1; k < solid.length && !direction; k++) {
    const delta = along(solid[k]) - along(solid[k - 1]);
    if (Math.abs(delta) > 1e-3) direction = Math.sign(delta);
  }
  const rtl = direction ? direction < 0 : (lineRtl[chars[0].index] ?? false);
  const stacked = direction === 0 && solid.length > 1;
  let sorted: TextObjectChar[];
  if (stacked) {
    sorted = rtl ? [...chars].reverse() : [...chars];
  } else {
    sorted = [...chars].sort(
      (a, b) => along(a) - along(b) || (rtl ? b.index - a.index : a.index - b.index),
    );
    if (rtl) {
      const firstSolid = chars.findIndex((c) => !isSpace(c.unicode));
      let lastSolid = chars.length - 1;
      while (lastSolid >= 0 && isSpace(chars[lastSolid].unicode)) lastSolid--;
      const trailing = new Set(chars.filter((_, k) => k > lastSolid).map((c) => c.index));
      const leading = new Set(chars.filter((_, k) => k < firstSolid).map((c) => c.index));
      if (trailing.size || leading.size) {
        const byIndexDesc = (a: TextObjectChar, b: TextObjectChar) => b.index - a.index;
        sorted = [
          ...sorted.filter((c) => trailing.has(c.index)).sort(byIndexDesc),
          ...sorted.filter((c) => !trailing.has(c.index) && !leading.has(c.index)),
          ...sorted.filter((c) => leading.has(c.index)).sort(byIndexDesc),
        ];
      }
    }
  }
  const scale = Math.hypot(ax, ay) || 1;
  const glyphs = sorted.map((c, k): PageTextGlyph => {
    const next = sorted[k + 1];
    let advance = c.width;
    if (next) {
      const step = along(next) - along(c);
      if (step > 0) advance = step / scale;
    }
    const unicode = rtl && MIRRORED[c.unicode] ? MIRRORED[c.unicode] : c.unicode;
    return {
      index: c.index,
      unicode,
      origin: { x: c.x, y: c.y },
      advance,
      ...(isSpace(unicode) ? { space: true as const } : {}),
      ...(stacked ? { stacked: true as const } : {}),
    };
  });
  return { glyphs, reversed: rtl };
}
