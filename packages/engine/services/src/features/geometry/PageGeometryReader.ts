import type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
  PageObjectNumber,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, normalizePdfRect } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

interface GlyphInfo {
  /** Loose char box in PDF user space (y-up edges). */
  looseBox: PdfRect;
  /** Tight glyph box in PDF user space (y-up edges), when available. */
  tightBox?: PdfRect;
  isSpace?: boolean;
  isEmpty?: boolean;
}

/**
 * Geometry-only text layout reader.
 *
 * Emits geometry in PDF user space (y-up edges) — the canonical engine
 * geometry. The viewer converts to content/view space via the page geometry
 * matrix; this reader applies NO Y-flip or device transform.
 */
export class PageGeometryReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(pageObjectNumber: PageObjectNumber, signal: AbortSignal): PageGeometrySnapshot {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    const pool = this.session.pagePool();
    const pagePtr = pool.acquire(pageObjectNumber);

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
        throwIfAborted(signal);
        const glyphCount = Math.max(fn.FPDFText_CountChars(textPagePtr), 0);
        const glyphs: GlyphInfo[] = [];

        for (let i = 0; i < glyphCount; i++) {
          throwIfAborted(signal);
          glyphs.push(this.readGlyphInfo(textPagePtr, i));
        }

        return {
          runs: this.buildRunsFromGlyphs(glyphs, textPagePtr),
        };
      } finally {
        fn.FPDFText_ClosePage(textPagePtr);
      }
    } finally {
      pool.release(pageObjectNumber);
    }
  }

  private buildRunsFromGlyphs(glyphs: GlyphInfo[], textPagePtr: Ptr): PageGeometryRun[] {
    const { fn } = this.runtime;
    const runs: PageGeometryRun[] = [];
    let current: PageGeometryRun | null = null;
    let curObjPtr: Ptr | null = null;
    let bounds: { left: number; bottom: number; right: number; top: number } | null = null;

    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      const objPtr = fn.FPDFText_GetTextObject(textPagePtr, i);

      if (objPtr !== curObjPtr) {
        curObjPtr = objPtr;
        current = {
          rect: { ...glyph.looseBox },
          charStart: i,
          glyphs: [],
          fontSize: fn.FPDFText_GetFontSize(textPagePtr, i),
        };
        bounds = { ...glyph.looseBox };
        runs.push(current);
      }

      current!.glyphs.push(toSlimGlyph(glyph));

      if (glyph.isEmpty) {
        continue;
      }

      bounds!.left = Math.min(bounds!.left, glyph.looseBox.left);
      bounds!.bottom = Math.min(bounds!.bottom, glyph.looseBox.bottom);
      bounds!.right = Math.max(bounds!.right, glyph.looseBox.right);
      bounds!.top = Math.max(bounds!.top, glyph.looseBox.top);

      current!.rect = { ...bounds! };
    }

    return runs;
  }

  private readGlyphInfo(textPagePtr: Ptr, charIndex: number): GlyphInfo {
    const { fn, mem } = this.runtime;
    const rectPtr = mem.alloc(16);
    const tLeftPtr = mem.alloc(8);
    const tRightPtr = mem.alloc(8);
    const tBottomPtr = mem.alloc(8);
    const tTopPtr = mem.alloc(8);
    const ptrs = [rectPtr, tLeftPtr, tRightPtr, tBottomPtr, tTopPtr];

    try {
      if (!fn.FPDFText_GetLooseCharBox(textPagePtr, charIndex, rectPtr)) {
        return emptyGlyph();
      }

      const left = Number(mem.peek(rectPtr, 'f32', 0));
      const top = Number(mem.peek(rectPtr, 'f32', 4));
      const right = Number(mem.peek(rectPtr, 'f32', 8));
      const bottom = Number(mem.peek(rectPtr, 'f32', 12));
      if (left === right || top === bottom) {
        return emptyGlyph();
      }

      // Loose box is already PDF user space (y-up). Normalize edges only.
      const glyph: GlyphInfo = {
        looseBox: normalizePdfRect({ left, bottom, right, top }),
      };

      if (
        fn.FPDFText_GetCharBox(textPagePtr, charIndex, tLeftPtr, tRightPtr, tBottomPtr, tTopPtr)
      ) {
        const tLeft = Number(mem.peek(tLeftPtr, 'f64'));
        const tRight = Number(mem.peek(tRightPtr, 'f64'));
        const tBottom = Number(mem.peek(tBottomPtr, 'f64'));
        const tTop = Number(mem.peek(tTopPtr, 'f64'));
        glyph.tightBox = normalizePdfRect({
          left: tLeft,
          bottom: tBottom,
          right: tRight,
          top: tTop,
        });
      }

      glyph.isSpace = fn.FPDFText_GetUnicode(textPagePtr, charIndex) === 32;
      return glyph;
    } finally {
      for (const ptr of ptrs) mem.free(ptr);
    }
  }
}

function emptyGlyph(): GlyphInfo {
  return {
    looseBox: { left: 0, bottom: 0, right: 0, top: 0 },
    isEmpty: true,
  };
}

function toSlimGlyph(glyph: GlyphInfo): PageGeometryGlyph {
  return {
    looseBox: glyph.looseBox,
    flags: glyph.isEmpty ? 2 : glyph.isSpace ? 1 : 0,
    ...(glyph.tightBox ? { tightBox: glyph.tightBox } : {}),
  };
}
