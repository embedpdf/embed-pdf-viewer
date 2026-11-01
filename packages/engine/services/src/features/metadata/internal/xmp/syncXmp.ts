import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

import { editXmp, type XmpEdit } from './editXmp';
import { readXmpPacket, writeXmpPacket } from './xmpPacket';

/**
 * Makes `edits` to the document's XMP packet, so apps that read it rather
 * than /Info see the same metadata. A document without a packet is left
 * without one (apps read /Info then), and a packet that can't be read is left
 * as it is. A packet whose text doesn't change isn't written.
 *
 * Throws {@link EngineError} `Unknown` if the native write fails.
 */
export function syncXmp(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  edits: readonly XmpEdit[],
): void {
  if (edits.length === 0) return;
  const packet = readXmpPacket(fn, mem, docPtr);
  if (!packet) return;
  const text = editXmp(packet.text, edits);
  if (text === null || text === packet.text) return;
  if (!writeXmpPacket(fn, mem, docPtr, { ...packet, text })) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to write the XMP metadata');
  }
}
