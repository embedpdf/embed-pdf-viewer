import type { CharMapAnchor, PageObjectNumber, PageTextSnapshot } from '@embedpdf/engine-core/runtime';
import { charMapViolation, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { throwIfAborted } from '../../shared/abort';

/**
 * Per-page slow-path text reader. Acquires a `pagePtr` from the
 * `PagePtrPool`, opens a PDFium text page (`FPDFText_LoadPage`), extracts
 * the page text, and releases everything in reverse order.
 *
 * Index spaces (see engine-core `text/charmap.ts`): `charCount` is the
 * CHARACTER space (`FPDFText_CountChars` — the space geometry runs tile);
 * `text` is the TEXT projection. The two diverge when a character
 * contributes zero text units (non-printing) or two (supplementary plane);
 * `charMap` anchors encode exactly those deviations.
 *
 * Both come from the fork's batched extension calls, which share one
 * encoding authority (`FX_UTF16Encode`) so text and map can never
 * disagree:
 *
 *   - `EPDFText_GetTextFull` — true UTF-16LE extraction; supplementary
 *     characters arrive as surrogate pairs instead of being silently
 *     dropped by `FPDFText_GetText`'s UCS-2 encoder. Called once with an
 *     upper-bound buffer (2 units per character + NUL), so no measure
 *     round-trip.
 *   - `EPDFText_GetCharToTextMap` — the anchors, measure-then-fill. Zero
 *     anchors is the common (identity) page and skips the fill call.
 */
export class PageTextReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  read(pageObjectNumber: PageObjectNumber, signal: AbortSignal): PageTextSnapshot {
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
        const charCount = Math.max(fn.FPDFText_CountChars(textPagePtr), 0);
        const text = readTextFull(this.runtime, textPagePtr, charCount);
        const charMap = readCharMap(this.runtime, textPagePtr, pageObjectNumber);
        // Cross-check the two calls against the shared invariants — a
        // disagreement is an engine bug and must fail loudly, never ship a
        // snapshot that slices wrong.
        const violation = charMapViolation(charCount, text.length, charMap);
        if (violation !== null) {
          throw new EngineError(
            EngineErrorCode.RuntimeUnavailable,
            `char map invariant violated for page object ${pageObjectNumber}: ${violation}`,
          );
        }
        return charMap.length > 0 ? { text, charCount, charMap } : { text, charCount };
      } finally {
        fn.FPDFText_ClosePage(textPagePtr);
      }
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

/**
 * Full-fidelity page text in one call: the buffer is sized at the maximum
 * possible expansion (every character a surrogate pair, plus the NUL), so
 * the returned requirement always fits and the measure round-trip is
 * skipped. The return value counts UTF-16 units INCLUDING the terminator.
 */
function readTextFull(
  runtime: PdfRuntimeModule,
  textPagePtr: Ptr,
  charCount: number,
): string {
  if (charCount <= 0) return '';
  const { fn, mem } = runtime;
  const bufUnits = charCount * 2 + 1;
  return withScratch(mem, bufUnits * 2, (buf) => {
    const written = fn.EPDFText_GetTextFull(textPagePtr, buf, bufUnits);
    if (written <= 1) return '';
    return decodeUtf16Le(mem.readBytes(buf, (written - 1) * 2));
  });
}

function decodeUtf16Le(bytes: Uint8Array): string {
  const units = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  let out = '';
  const CHUNK = 0x2000;
  for (let i = 0; i < units.length; i += CHUNK) {
    out += String.fromCharCode(...units.subarray(i, Math.min(i + CHUNK, units.length)));
  }
  return out;
}

/** Anchor struct layout: two little-endian i32s (see EPDF_CHAR_MAP_ANCHOR). */
const ANCHOR_BYTES = 8;

function readCharMap(
  runtime: PdfRuntimeModule,
  textPagePtr: Ptr,
  pageObjectNumber: PageObjectNumber,
): CharMapAnchor[] {
  const { fn, mem } = runtime;
  const count = fn.EPDFText_GetCharToTextMap(textPagePtr, NULL_PTR, 0);
  if (count < 0) {
    throw new EngineError(
      EngineErrorCode.RuntimeUnavailable,
      `EPDFText_GetCharToTextMap failed for page object ${pageObjectNumber}`,
    );
  }
  if (count === 0) return [];
  return withScratch(mem, count * ANCHOR_BYTES, (buf) => {
    fn.EPDFText_GetCharToTextMap(textPagePtr, buf, count);
    const bytes = mem.readBytes(buf, count * ANCHOR_BYTES);
    const words = new Int32Array(bytes.buffer, bytes.byteOffset, count * 2);
    const anchors: CharMapAnchor[] = new Array(count);
    for (let i = 0; i < count; i++) {
      anchors[i] = [words[i * 2], words[i * 2 + 1]];
    }
    return anchors;
  });
}
