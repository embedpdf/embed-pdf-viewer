import type {
  AnnotationFlags,
  Color,
  InkList,
  LineEndings,
  LinePoints,
  PdfPoint,
  PdfQuad,
  PdfRect,
  PdfRectDifferences,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/pdf-runtime';

import { withScratch, withScratchN } from '../../../../runtime/memory/scratch';
import { readUtf16String } from '../../../../runtime/memory/strings';
import {
  F32_BYTES,
  I32_BYTES,
  POINTF_BYTES,
  QUADPOINTSF_BYTES,
  RECTF_BYTES,
  readF32,
  readI32,
  readRectF,
} from '../../../../runtime/memory/structs';
import { bitsToFlags } from '../annotationFlagBits';
import { lineEndingFromCode } from '../lineEnding';

/**
 * Reads a UTF-16 string entry from an annotation dictionary. Returns
 * `null` if the key is not present, otherwise the (possibly empty) string.
 */
export function readAnnotString(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  key: string,
): string | null {
  if (!fn.FPDFAnnot_HasKey(annotPtr, key)) return null;
  return readUtf16String(
    mem,
    (buf, capacity) => fn.FPDFAnnot_GetStringValue(annotPtr, key, buf, capacity),
    '',
  );
}

/**
 * Read /Rect from an annot dict via FPDFAnnot_GetRect.
 * FS_RECTF layout: { float left, top, right, bottom } -> 16 bytes.
 */
export function readAnnotRect(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): PdfRect {
  return withScratch(mem, RECTF_BYTES, (buf) => {
    if (!fn.FPDFAnnot_GetRect(annotPtr, buf)) {
      return { left: 0, bottom: 0, right: 0, top: 0 };
    }
    return readRectF(mem, buf);
  });
}

export function readAnnotFlags(fn: PdfFunctions, annotPtr: Ptr): AnnotationFlags {
  return bitsToFlags(fn.FPDFAnnot_GetFlags(annotPtr));
}

/**
 * Read an annotation color via the EmbedPDF `EPDFAnnot_GetColor`
 * extension. The `type` arg (FPDFANNOT_COLORTYPE) selects which color to
 * read — `0` (default) is the stroke/fill `/C`, `1` is the interior `/IC`
 * of square/circle/polygon annotations. Unlike the stock
 * `FPDFAnnot_GetColor`, the extension exposes interior color. Returns RGB
 * only — annotation opacity lives in `/CA`, not a per-color alpha.
 *
 * Returns `null` when the requested color entry is absent.
 */
export function readAnnotColor(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  type: number = 0, // FPDFANNOT_COLORTYPE_Color
): Color | null {
  return withScratchN(mem, [I32_BYTES, I32_BYTES, I32_BYTES], ([r, g, b]) => {
    if (!fn.EPDFAnnot_GetColor(annotPtr, type, r, g, b)) return null;
    return {
      r: readI32(mem, r) & 0xff,
      g: readI32(mem, g) & 0xff,
      b: readI32(mem, b) & 0xff,
    };
  });
}

/**
 * Read annotation opacity via the EmbedPDF `EPDFAnnot_GetOpacity`
 * extension. Returns a 0..1 value (the native alpha is 0..255). Returns
 * `null` when the annotation has no opacity entry. This is the path that
 * stays consistent across native `EPDFAnnot_GenerateAppearance`, unlike a
 * raw `/CA` number read.
 */
export function readAnnotOpacity(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): number | null {
  return withScratch(mem, I32_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetOpacity(annotPtr, buf)) return null;
    return (readI32(mem, buf) & 0xff) / 255;
  });
}

/**
 * Read the `/BS /S` border style code and `/BS /W` border width via
 * `EPDFAnnot_GetBorderStyle`. The return value is the raw
 * `FPDF_ANNOT_BORDER_STYLE` enum code; the width is written into the
 * scratch out-parameter. Style/width string mapping lives in the shape
 * reader (engine-core stays PDFium-free).
 */
export function readBorderStyle(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): { styleCode: number; width: number } {
  return withScratch(mem, F32_BYTES, (buf) => {
    const styleCode = fn.EPDFAnnot_GetBorderStyle(annotPtr, buf);
    return { styleCode, width: readF32(mem, buf) };
  });
}

/**
 * Read the dash pattern of a dashed border. Returns an empty array when
 * the border is not dashed or has no `/BS /D` entry.
 */
export function readBorderDashPattern(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): number[] {
  const count = fn.EPDFAnnot_GetBorderDashPatternCount(annotPtr);
  if (count <= 0) return [];
  return withScratch(mem, count * F32_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetBorderDashPattern(annotPtr, buf, count)) return [];
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(readF32(mem, buf, i * F32_BYTES));
    return out;
  });
}

/**
 * Read the `/BE` cloudy border intensity. Returns `null` when the
 * annotation has no cloudy border effect.
 */
export function readBorderEffect(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): number | null {
  return withScratch(mem, F32_BYTES, (buf) => {
    if (!fn.EPDFAnnot_GetBorderEffect(annotPtr, buf)) return null;
    return readF32(mem, buf);
  });
}

/**
 * Read the `/RD` rectangle differences. Returns `null` when the
 * annotation has no `/RD` entry. PDFium reports `/RD` in
 * `[left, bottom, right, top]` order; we surface the wire-stable
 * `{ left, top, right, bottom }` shape.
 */
export function readRectangleDifferences(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): PdfRectDifferences | null {
  return withScratchN(
    mem,
    [F32_BYTES, F32_BYTES, F32_BYTES, F32_BYTES],
    ([left, bottom, right, top]) => {
      if (!fn.EPDFAnnot_GetRectangleDifferences(annotPtr, left, bottom, right, top)) return null;
      return {
        left: readF32(mem, left),
        bottom: readF32(mem, bottom),
        right: readF32(mem, right),
        top: readF32(mem, top),
      };
    },
  );
}

/**
 * Read the `/Vertices` point list of a polygon/polyline annotation via
 * the two-call `FPDFAnnot_GetVertices` pattern (probe for the count with
 * a NULL buffer, then read into a `count * FS_POINTF` buffer). Returns an
 * empty array when the annotation has no vertices.
 */
export function readVertices(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): PdfPoint[] {
  const count = fn.FPDFAnnot_GetVertices(annotPtr, NULL_PTR, 0);
  if (count <= 0) return [];
  return withScratch(mem, count * POINTF_BYTES, (buf) => {
    const got = fn.FPDFAnnot_GetVertices(annotPtr, buf, count);
    if (got <= 0) return [];
    const out: PdfPoint[] = [];
    for (let i = 0; i < got; i++) {
      const off = i * POINTF_BYTES;
      out.push({ x: readF32(mem, buf, off), y: readF32(mem, buf, off + 4) });
    }
    return out;
  });
}

/**
 * Read the `/InkList` of an ink annotation. `FPDFAnnot_GetInkListCount`
 * gives the number of strokes; each stroke is sized with a probe call to
 * `FPDFAnnot_GetInkListPath` (NULL buffer) and then read into a
 * `count * FS_POINTF` buffer. Empty strokes are skipped; the result is an
 * array of non-empty point paths.
 */
export function readInkList(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): InkList {
  const pathCount = fn.FPDFAnnot_GetInkListCount(annotPtr);
  if (pathCount <= 0) return [];
  const out: InkList = [];
  for (let p = 0; p < pathCount; p++) {
    const count = fn.FPDFAnnot_GetInkListPath(annotPtr, p, NULL_PTR, 0);
    if (count <= 0) continue;
    const stroke = withScratch(mem, count * POINTF_BYTES, (buf) => {
      const got = fn.FPDFAnnot_GetInkListPath(annotPtr, p, buf, count);
      if (got <= 0) return [];
      const pts: PdfPoint[] = [];
      for (let i = 0; i < got; i++) {
        const off = i * POINTF_BYTES;
        pts.push({ x: readF32(mem, buf, off), y: readF32(mem, buf, off + 4) });
      }
      return pts;
    });
    if (stroke.length > 0) out.push(stroke);
  }
  return out;
}

/**
 * Read the `/L` endpoints of a line annotation via `FPDFAnnot_GetLine`
 * (two `FS_POINTF` out-params). Returns `null` when the annotation is not
 * a line or has no `/L` entry.
 */
export function readLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): LinePoints | null {
  return withScratchN(mem, [POINTF_BYTES, POINTF_BYTES], ([start, end]) => {
    if (!fn.FPDFAnnot_GetLine(annotPtr, start, end)) return null;
    return {
      start: { x: readF32(mem, start, 0), y: readF32(mem, start, 4) },
      end: { x: readF32(mem, end, 0), y: readF32(mem, end, 4) },
    };
  });
}

/**
 * Read the `/LE` line endings of a line/polyline annotation via the
 * EmbedPDF `EPDFAnnot_GetLineEndings` extension (two int out-params).
 * Returns `{ start: 'none', end: 'none' }` when the annotation has no
 * `/LE` entry, so callers always get a well-formed pair.
 */
export function readLineEndings(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): LineEndings {
  return withScratchN(mem, [I32_BYTES, I32_BYTES], ([start, end]) => {
    if (!fn.EPDFAnnot_GetLineEndings(annotPtr, start, end)) {
      return { start: 'none', end: 'none' };
    }
    return {
      start: lineEndingFromCode(readI32(mem, start)),
      end: lineEndingFromCode(readI32(mem, end)),
    };
  });
}

/**
 * Read the `/DA` default appearance (font + size + colour) of a free-text
 * annotation via `EPDFAnnot_GetDefaultAppearance` (font int, size f32, and
 * r/g/b int out-params). `fontCode` is the raw `FPDF_STANDARD_FONT` enum
 * value. Returns `null` when the annotation has no `/DA`.
 */
export function readDefaultAppearance(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): { fontCode: number; fontSize: number; color: Color } | null {
  return withScratchN(
    mem,
    [I32_BYTES, F32_BYTES, I32_BYTES, I32_BYTES, I32_BYTES],
    ([font, size, r, g, b]) => {
      if (!fn.EPDFAnnot_GetDefaultAppearance(annotPtr, font, size, r, g, b)) return null;
      return {
        fontCode: readI32(mem, font),
        fontSize: readF32(mem, size),
        color: {
          r: readI32(mem, r) & 0xff,
          g: readI32(mem, g) & 0xff,
          b: readI32(mem, b) & 0xff,
        },
      };
    },
  );
}

/**
 * Read the `/Q` text alignment quadding code of a free-text annotation via
 * `EPDFAnnot_GetTextAlignment`. The code<->string mapping lives in
 * `textAlignment.ts`; an absent `/Q` reads back as `0` (left).
 */
export function readTextAlignment(fn: PdfFunctions, annotPtr: Ptr): number {
  return fn.EPDFAnnot_GetTextAlignment(annotPtr);
}

/**
 * Read `/OverlayText` of a redact annotation via `EPDFAnnot_GetOverlayText`
 * (standard UTF-16 byte-length ABI). Returns `null` when the key is absent
 * (the redaction has no label), otherwise the — possibly empty — label.
 */
export function readOverlayText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): string | null {
  if (!fn.FPDFAnnot_HasKey(annotPtr, 'OverlayText')) return null;
  return readUtf16String(
    mem,
    (buf, capacity) => fn.EPDFAnnot_GetOverlayText(annotPtr, buf, capacity),
    '',
  );
}

/**
 * Read `/Repeat` of a redact annotation via `EPDFAnnot_GetOverlayTextRepeat`
 * (an absent key reads as `false`, the PDF default).
 */
export function readOverlayTextRepeat(fn: PdfFunctions, annotPtr: Ptr): boolean {
  return fn.EPDFAnnot_GetOverlayTextRepeat(annotPtr);
}

/**
 * Read the `/IT` intent name via `EPDFAnnot_GetIntent`. Unlike the standard
 * `FPDFAnnot_GetStringValue` ABI, this getter reports the count of UTF-16
 * code units (excluding the NUL), so we size the buffer as
 * `(count + 1) * 2` bytes. Returns `null` when no intent is present.
 */
export function readIntent(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): string | null {
  const codeUnits = fn.EPDFAnnot_GetIntent(annotPtr, NULL_PTR, 0);
  if (codeUnits <= 0) return null;
  const bytes = (codeUnits + 1) * 2;
  return withScratch(mem, bytes, (buf) => {
    fn.EPDFAnnot_GetIntent(annotPtr, buf, bytes);
    return mem.readU16String(buf);
  });
}

/**
 * Read the `/CL` callout leader line of a free-text callout via
 * `EPDFAnnot_GetCalloutLineCount` + `EPDFAnnot_GetCalloutLine` (the points
 * are read into a `count * FS_POINTF` buffer, like {@link readVertices}).
 * Returns an empty array when there is no callout line.
 */
export function readCalloutLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
): PdfPoint[] {
  const count = fn.EPDFAnnot_GetCalloutLineCount(annotPtr);
  if (count <= 0) return [];
  return withScratch(mem, count * POINTF_BYTES, (buf) => {
    const got = fn.EPDFAnnot_GetCalloutLine(annotPtr, buf, count);
    if (got <= 0) return [];
    const out: PdfPoint[] = [];
    for (let i = 0; i < got; i++) {
      const off = i * POINTF_BYTES;
      out.push({ x: readF32(mem, buf, off), y: readF32(mem, buf, off + 4) });
    }
    return out;
  });
}

/**
 * Read attachment points for a text-markup annotation.
 * Each `FS_QUADPOINTSF` is 8 floats = 32 bytes.
 */
export function readQuadPoints(fn: PdfFunctions, mem: PdfRuntimeMemory, annotPtr: Ptr): PdfQuad[] {
  const count = fn.FPDFAnnot_CountAttachmentPoints(annotPtr);
  if (count <= 0) return [];

  return withScratch(mem, QUADPOINTSF_BYTES, (buf) => {
    const out: PdfQuad[] = [];
    for (let i = 0; i < count; i++) {
      if (!fn.FPDFAnnot_GetAttachmentPoints(annotPtr, i, buf)) continue;
      const f = (off: number) => readF32(mem, buf, off);
      // Positional, in PDFium FS_QUADPOINTSF slot order (PDF 32000 12.5.6.10):
      // { x1,y1, x2,y2, x3,y3, x4,y4 } -> p1 p2 p3 p4. We do NOT relabel these
      // as named corners: PdfQuad asserts no corner semantics (see its docs).
      out.push({
        p1: { x: f(0), y: f(4) },
        p2: { x: f(8), y: f(12) },
        p3: { x: f(16), y: f(20) },
        p4: { x: f(24), y: f(28) },
      });
    }
    return out;
  });
}
