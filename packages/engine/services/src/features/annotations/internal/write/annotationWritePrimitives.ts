import {
  EngineError,
  EngineErrorCode,
  type AnnotationFlags,
  type Color,
  type InkList,
  type LineEndings,
  type LinePoints,
  type PdfPoint,
  type PdfRect,
  type PdfRectDifferences,
} from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { F32_BYTES, POINTF_BYTES, RECTF_BYTES } from '../../../../runtime/memory/structs';
import { flagsToBits } from '../annotationFlagBits';
import { FPDFANNOT_COLORTYPE } from '../colorType';
import { lineEndingToCode } from '../lineEnding';

/**
 * Write-side twin of `annotationReadPrimitives.ts`. Every annotation
 * family (text-markup, shape, and upcoming polygon/polyline/line/free-text)
 * composes these low-level setters so the PDFium FFI surface lives in one
 * place. All colour/opacity/border writes go through the EmbedPDF
 * `EPDFAnnot_*` extensions — the same path v2 used and the read primitives
 * read back — so values survive native `EPDFAnnot_GenerateAppearance`.
 */

/**
 * Set an annotation colour via the EmbedPDF `EPDFAnnot_SetColor`
 * extension. The `type` arg (FPDFANNOT_COLORTYPE) selects which colour to
 * write — `Color` is the stroke/fill `/C`, `InteriorColor` is the `/IC`
 * of square/circle/polygon. RGB only; annotation opacity lives in `/CA`
 * (see {@link setAnnotOpacity}), not a per-colour alpha. The stock
 * `FPDFAnnot_SetColor` cannot author interior colour, which is why we use
 * the extension uniformly.
 */
export function setAnnotColor(
  fn: PdfFunctions,
  annotPtr: Ptr,
  color: Color,
  type: number = FPDFANNOT_COLORTYPE.Color,
): void {
  const ok = fn.EPDFAnnot_SetColor(annotPtr, type, color.r & 0xff, color.g & 0xff, color.b & 0xff);
  if (!ok) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetColor returned false');
  }
}

/**
 * Remove an annotation colour entry via `EPDFAnnot_ClearColor` (e.g. a
 * transparent fill clears `/IC`). A false return is benign — there was no
 * entry to clear — so we don't treat it as an error.
 */
export function clearAnnotColor(fn: PdfFunctions, annotPtr: Ptr, type: number): void {
  fn.EPDFAnnot_ClearColor(annotPtr, type);
}

/**
 * Set annotation opacity (`/CA`) via the dedicated `EPDFAnnot_SetOpacity`
 * extension. Input is 0..1; the native alpha is 0..255. This is the path
 * that stores `/CA` in the form native appearance generation expects, so
 * opacity survives the bake.
 */
export function setAnnotOpacity(fn: PdfFunctions, annotPtr: Ptr, opacity: number): void {
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  if (!fn.EPDFAnnot_SetOpacity(annotPtr, alpha)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetOpacity returned false');
  }
}

/**
 * Set the `/F` (Annotation Flags) entry via `FPDFAnnot_SetFlags`. Only the
 * keys present in `partial` are changed; the rest preserve their current
 * value (read back via `FPDFAnnot_GetFlags` first). On create the dict
 * starts at 0, so this is equivalently "set exactly these"; on update it
 * merges onto the live flags.
 */
export function setAnnotFlags(
  fn: PdfFunctions,
  annotPtr: Ptr,
  partial: Partial<AnnotationFlags>,
): void {
  const next = flagsToBits(fn.FPDFAnnot_GetFlags(annotPtr), partial);
  if (!fn.FPDFAnnot_SetFlags(annotPtr, next)) {
    throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_SetFlags returned false');
  }
}

/**
 * Write `/Rect` via `FPDFAnnot_SetRect`. FS_RECTF layout is
 * `{ left, top, right, bottom }` (top > bottom in PDF coords).
 */
export function setAnnotRect(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  rect: PdfRect,
): void {
  const buf = mem.alloc(RECTF_BYTES);
  try {
    mem.poke(buf, 'f32', rect.left, 0);
    mem.poke(buf, 'f32', rect.top, 4);
    mem.poke(buf, 'f32', rect.right, 8);
    mem.poke(buf, 'f32', rect.bottom, 12);
    if (!fn.FPDFAnnot_SetRect(annotPtr, buf)) {
      throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_SetRect returned false');
    }
  } finally {
    mem.free(buf);
  }
}

/**
 * Set `/BS /S` (border style code) and `/BS /W` (width) in one call via
 * `EPDFAnnot_SetBorderStyle`. `styleCode` is a raw
 * `FPDF_ANNOT_BORDER_STYLE` enum value — the string<->code mapping lives
 * in `shapeBorderStyle.ts` so engine-core stays PDFium-free.
 */
export function setBorderStyle(
  fn: PdfFunctions,
  annotPtr: Ptr,
  styleCode: number,
  width: number,
): void {
  if (!fn.EPDFAnnot_SetBorderStyle(annotPtr, styleCode, width)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetBorderStyle returned false');
  }
}

/**
 * Write the dashed-border pattern (`/BS /D`) via
 * `EPDFAnnot_SetBorderDashPattern`. Each entry is clamped to >= 0.
 */
export function setBorderDashPattern(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  dashArray: number[],
): void {
  const buf = mem.alloc(dashArray.length * F32_BYTES);
  try {
    for (let i = 0; i < dashArray.length; i++) {
      mem.poke(buf, 'f32', Math.max(0, dashArray[i]!), i * F32_BYTES);
    }
    if (!fn.EPDFAnnot_SetBorderDashPattern(annotPtr, buf, dashArray.length)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'EPDFAnnot_SetBorderDashPattern returned false',
      );
    }
  } finally {
    mem.free(buf);
  }
}

/** Set the `/BE` cloudy border effect intensity. */
export function setBorderEffect(fn: PdfFunctions, annotPtr: Ptr, intensity: number): void {
  if (!fn.EPDFAnnot_SetBorderEffect(annotPtr, intensity)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetBorderEffect returned false');
  }
}

/**
 * Remove the `/BE` cloudy border effect. A false return is benign (there
 * was no effect to clear), so we don't treat it as an error.
 */
export function clearBorderEffect(fn: PdfFunctions, annotPtr: Ptr): void {
  fn.EPDFAnnot_ClearBorderEffect(annotPtr);
}

/**
 * Write `/RD` rectangle differences via
 * `EPDFAnnot_SetRectangleDifferences`. PDFium core stores `/RD` as
 * `[left, bottom, right, top]`; we accept the wire-stable
 * `{ left, top, right, bottom }` shape and reorder at the boundary.
 */
export function setRectangleDifferences(
  fn: PdfFunctions,
  annotPtr: Ptr,
  rd: PdfRectDifferences,
): void {
  if (!fn.EPDFAnnot_SetRectangleDifferences(annotPtr, rd.left, rd.bottom, rd.right, rd.top)) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'EPDFAnnot_SetRectangleDifferences returned false',
    );
  }
}

/**
 * Remove the `/RD` rectangle-differences entry. A false return is benign
 * (there was no entry to clear), so we don't treat it as an error.
 */
export function clearRectangleDifferences(fn: PdfFunctions, annotPtr: Ptr): void {
  fn.EPDFAnnot_ClearRectangleDifferences(annotPtr);
}

/**
 * Replace the `/Vertices` point list of a polygon/polyline annotation via
 * the EmbedPDF `EPDFAnnot_SetVertices` extension. Writes the points into a
 * contiguous `count * FS_POINTF` buffer.
 */
export function setVertices(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  vertices: PdfPoint[],
): void {
  const buf = mem.alloc(vertices.length * POINTF_BYTES);
  try {
    for (let i = 0; i < vertices.length; i++) {
      const off = i * POINTF_BYTES;
      mem.poke(buf, 'f32', vertices[i]!.x, off);
      mem.poke(buf, 'f32', vertices[i]!.y, off + 4);
    }
    if (!fn.EPDFAnnot_SetVertices(annotPtr, buf, vertices.length)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetVertices returned false');
    }
  } finally {
    mem.free(buf);
  }
}

/**
 * Write the `/L` endpoints of a line annotation via the EmbedPDF
 * `EPDFAnnot_SetLine` extension. Uses one 16-byte buffer holding two
 * `FS_POINTF` structs (start at offset 0, end at offset 8).
 */
export function setLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  line: LinePoints,
): void {
  const start = mem.alloc(POINTF_BYTES);
  const end = mem.alloc(POINTF_BYTES);
  try {
    mem.poke(start, 'f32', line.start.x, 0);
    mem.poke(start, 'f32', line.start.y, 4);
    mem.poke(end, 'f32', line.end.x, 0);
    mem.poke(end, 'f32', line.end.y, 4);
    if (!fn.EPDFAnnot_SetLine(annotPtr, start, end)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetLine returned false');
    }
  } finally {
    mem.free(start);
    mem.free(end);
  }
}

/**
 * Replace the `/InkList` of an ink annotation. PDFium has no single
 * "set ink list" call, so we clear any existing list with
 * `FPDFAnnot_RemoveInkList` (a false return is benign on a freshly-created
 * annotation that has none) and re-add each non-empty stroke via
 * `FPDFAnnot_AddInkStroke`, which takes a contiguous `count * FS_POINTF`
 * buffer and returns the new stroke index (`< 0` on failure).
 */
export function setInkList(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  inkList: InkList,
): void {
  fn.FPDFAnnot_RemoveInkList(annotPtr);
  for (const stroke of inkList) {
    if (stroke.length === 0) continue;
    const buf = mem.alloc(stroke.length * POINTF_BYTES);
    try {
      for (let i = 0; i < stroke.length; i++) {
        const off = i * POINTF_BYTES;
        mem.poke(buf, 'f32', stroke[i]!.x, off);
        mem.poke(buf, 'f32', stroke[i]!.y, off + 4);
      }
      if (fn.FPDFAnnot_AddInkStroke(annotPtr, buf, stroke.length) < 0) {
        throw new EngineError(EngineErrorCode.Unknown, 'FPDFAnnot_AddInkStroke returned < 0');
      }
    } finally {
      mem.free(buf);
    }
  }
}

/**
 * Write the `/LE` line endings of a line/polyline annotation via the
 * EmbedPDF `EPDFAnnot_SetLineEndings` extension. The string<->code mapping
 * lives in `lineEnding.ts` so engine-core stays PDFium-free.
 */
export function setLineEndings(fn: PdfFunctions, annotPtr: Ptr, endings: LineEndings): void {
  if (
    !fn.EPDFAnnot_SetLineEndings(
      annotPtr,
      lineEndingToCode(endings.start),
      lineEndingToCode(endings.end),
    )
  ) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetLineEndings returned false');
  }
}

/**
 * Write the `/DA` default appearance (font + size + colour) of a free-text
 * annotation via `EPDFAnnot_SetDefaultAppearance`. The `/DA` colour paints
 * the border and the default text colour; a separate `TextColor` entry (see
 * {@link setAnnotColor}) overrides the text only. `fontCode` is the raw
 * `FPDF_STANDARD_FONT` enum value — the string<->code mapping lives in
 * `standardFont.ts` so engine-core stays PDFium-free.
 */
export function setDefaultAppearance(
  fn: PdfFunctions,
  annotPtr: Ptr,
  fontCode: number,
  fontSize: number,
  color: Color,
): void {
  if (
    !fn.EPDFAnnot_SetDefaultAppearance(
      annotPtr,
      fontCode,
      fontSize,
      color.r & 0xff,
      color.g & 0xff,
      color.b & 0xff,
    )
  ) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetDefaultAppearance returned false');
  }
}

/**
 * Write the `/DA` default appearance using a runtime font registered through
 * `engine.fonts` (via `EPDFAnnot_SetDefaultAppearanceRegisteredFont`). `fontId`
 * is the thread-local `CFX_FontRegistry::FontId` resolved from the stable
 * `registeredFontKey` at authoring time. The font's glyph subset is embedded
 * into the annotation's appearance stream when the document/layer is saved.
 */
export function setDefaultAppearanceRegisteredFont(
  fn: PdfFunctions,
  annotPtr: Ptr,
  fontId: number,
  fontSize: number,
  color: Color,
): void {
  if (
    !fn.EPDFAnnot_SetDefaultAppearanceRegisteredFont(
      annotPtr,
      fontId,
      fontSize,
      color.r & 0xff,
      color.g & 0xff,
      color.b & 0xff,
    )
  ) {
    throw new EngineError(
      EngineErrorCode.Unknown,
      'EPDFAnnot_SetDefaultAppearanceRegisteredFont returned false',
    );
  }
}

/**
 * Write the `/Q` text alignment of a free-text annotation via
 * `EPDFAnnot_SetTextAlignment`. `code` is the raw quadding value — the
 * string<->code mapping lives in `textAlignment.ts`.
 */
export function setTextAlignment(fn: PdfFunctions, annotPtr: Ptr, code: number): void {
  if (!fn.EPDFAnnot_SetTextAlignment(annotPtr, code)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetTextAlignment returned false');
  }
}

/**
 * Write the `/IT` intent name via `EPDFAnnot_SetIntent` (expects a UTF-8
 * bytestring without the leading slash, e.g. `'FreeTextCallout'`). The
 * string<->name mapping lives in `freeTextIntent.ts`.
 */
export function setIntent(fn: PdfFunctions, annotPtr: Ptr, name: string): void {
  if (!fn.EPDFAnnot_SetIntent(annotPtr, name)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetIntent returned false');
  }
}

/**
 * Write the `/CL` callout leader line of a free-text callout via
 * `EPDFAnnot_SetCalloutLine`. Accepts 2 points (straight leader) or 3
 * (knee-jointed); writes them into a contiguous `count * FS_POINTF` buffer
 * (like {@link setVertices}).
 */
/**
 * Write `/OverlayText` of a redact annotation via `EPDFAnnot_SetOverlayText`.
 * The native setter removes the key for an empty string, so passing `''`
 * clears the label.
 */
export function setOverlayText(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  text: string,
): void {
  const ptr = mem.writeU16String(text);
  try {
    if (!fn.EPDFAnnot_SetOverlayText(annotPtr, ptr)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetOverlayText returned false');
    }
  } finally {
    mem.free(ptr);
  }
}

/**
 * Write `/Repeat` of a redact annotation via `EPDFAnnot_SetOverlayTextRepeat`
 * (`false` removes the key — absent is the PDF default).
 */
export function setOverlayTextRepeat(fn: PdfFunctions, annotPtr: Ptr, repeat: boolean): void {
  if (!fn.EPDFAnnot_SetOverlayTextRepeat(annotPtr, repeat)) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetOverlayTextRepeat returned false');
  }
}

export function setCalloutLine(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  annotPtr: Ptr,
  points: readonly PdfPoint[],
): void {
  const buf = mem.alloc(points.length * POINTF_BYTES);
  try {
    for (let i = 0; i < points.length; i++) {
      const off = i * POINTF_BYTES;
      mem.poke(buf, 'f32', points[i]!.x, off);
      mem.poke(buf, 'f32', points[i]!.y, off + 4);
    }
    if (!fn.EPDFAnnot_SetCalloutLine(annotPtr, buf, points.length)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAnnot_SetCalloutLine returned false');
    }
  } finally {
    mem.free(buf);
  }
}
