import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../../runtime/memory/scratch';

type PacketEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

/** A document's XMP packet as text, and the encoding it goes back in. */
export interface XmpPacket {
  text: string;
  encoding: PacketEncoding;
}

/**
 * The document's XMP packet (the catalog's /Metadata stream), or `null` when
 * it has none, or bytes that aren't UTF-8 or UTF-16 text (XMP allows UTF-32
 * too, which no PDF tool writes).
 */
export function readXmpPacket(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
): XmpPacket | null {
  const size = fn.EPDFCatalog_GetMetadata(docPtr, NULL_PTR, 0);
  if (size <= 0) return null;
  const bytes = withScratch(mem, size, (buf) =>
    fn.EPDFCatalog_GetMetadata(docPtr, buf, size) === size ? mem.readBytes(buf, size) : null,
  );
  const encoding = bytes && encodingOf(bytes);
  if (!bytes || !encoding) return null;
  try {
    // The byte order mark stays in the text, so the packet goes back with it.
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
    return { text, encoding };
  } catch {
    return null;
  }
}

/** Replaces the document's XMP packet. Returns the native success flag. */
export function writeXmpPacket(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  packet: XmpPacket,
): boolean {
  const bytes = encode(packet);
  return withScratch(mem, Math.max(bytes.length, 1), (buf) => {
    mem.writeBytes(buf, bytes);
    return fn.EPDFCatalog_SetMetadata(docPtr, buf, bytes.length);
  });
}

/**
 * The encoding XMP's rules let a reader tell from the first bytes: a byte
 * order mark, or the zero bytes around the packet's first `<`.
 */
function encodingOf(bytes: Uint8Array): PacketEncoding | null {
  const [b0 = 1, b1 = 1, b2 = 1, b3 = 1] = bytes;
  if (b0 === 0xfe && b1 === 0xff) return 'utf-16be';
  if (b0 === 0xff && b1 === 0xfe) return b2 === 0 && b3 === 0 ? null : 'utf-16le';
  if (b0 === 0 && b1 === 0) return null;
  if (b0 === 0) return 'utf-16be';
  if (b1 === 0) return b2 === 0 ? null : 'utf-16le';
  return 'utf-8';
}

function encode({ text, encoding }: XmpPacket): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(text);
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(i * 2, text.charCodeAt(i), encoding === 'utf-16le');
  }
  return bytes;
}
