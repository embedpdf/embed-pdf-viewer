import type { PdfDestination } from '@embedpdf/engine-core/runtime';
import type {
  PdfFunctions,
  PdfRuntimeMemory,
  PdfRuntimeModule,
  Ptr,
} from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { readDestination } from './readDestination';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { withScratch } from '../../runtime/memory/scratch';
import { readI32 } from '../../runtime/memory/structs';
import { pokeU64, U64_BYTES } from '../../runtime/memory/u64';

/** One entry of the document's named destinations: its name and its destination. */
export interface NamedDestinationEntry {
  readonly name: string;
  readonly dest: Ptr;
}

/**
 * The document's named destinations (the catalog's `/Names /Dests` name tree,
 * then the older `/Dests` dictionary), in PDFium's order. Each `dest` is the
 * same pointer PDFium hands out when a `/Dest` or a GoTo `/D` names it, so an
 * item's name is found by comparing pointers. Names are compared as text,
 * the way `FPDF_GetNamedDest` decodes them (a UTF-16 name tree key or a
 * name object).
 */
export function readNamedDestinations(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
): NamedDestinationEntry[] {
  const count = Number(fn.FPDF_CountNamedDests(docPtr));
  const entries: NamedDestinationEntry[] = [];
  for (let i = 0; i < count; i++) {
    // `long* buflen`: 8 bytes on native, 4 on wasm32; the low half is read either way.
    const entry = withScratch(mem, U64_BYTES, (lenPtr) => {
      pokeU64(mem, lenPtr, 0);
      const probe = fn.FPDF_GetNamedDest(docPtr, i, NULL_PTR, lenPtr);
      const bytes = readI32(mem, lenPtr);
      if (!probe || bytes <= 0) return null;
      return withScratch(mem, bytes, (buf) => {
        pokeU64(mem, lenPtr, bytes);
        const dest = fn.FPDF_GetNamedDest(docPtr, i, buf, lenPtr);
        return dest ? { name: mem.readU16String(buf), dest } : null;
      });
    });
    if (entry) entries.push(entry);
  }
  return entries;
}

/** The name `dest` was reached by, among `entries`; `null` for an explicit destination. */
export function nameOfDestination(
  entries: readonly NamedDestinationEntry[],
  dest: Ptr,
): string | null {
  for (const entry of entries) if (entry.dest === dest) return entry.name;
  return null;
}

/**
 * The destination the document names `name`, in the file's coordinates;
 * `null` when no destination has that name or its page is gone.
 */
export function resolveNamedDestination(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  name: string,
  signal: AbortSignal,
): PdfDestination | null {
  throwIfAborted(signal);
  const { fn, mem } = runtime;
  const docPtr = session.requireDocPtr();
  const entry = readNamedDestinations(fn, mem, docPtr).find((e) => e.name === name);
  return entry ? readDestination(fn, mem, docPtr, entry.dest) : null;
}
