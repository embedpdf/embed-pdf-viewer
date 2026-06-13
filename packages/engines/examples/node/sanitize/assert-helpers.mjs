// Shared assertion helpers for the sanitize tests. These re-parse saved output
// with pdf-lib independently of the engine that produced it, so a "vector gone"
// assertion is a true second-opinion check, not the engine confirming itself.
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

export async function loadDoc(bytes) {
  // updateMetadata: false so load() does not itself rewrite the Info dict.
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc;
}

export function catalogHas(doc, key) {
  return doc.catalog.get(PDFName.of(key)) !== undefined;
}

export function namesSubtree(doc, key) {
  // lookupMaybe (not lookup) so a missing/removed /Names tree returns undefined
  // instead of throwing.
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (!names) return undefined;
  return names.get(PDFName.of(key));
}

export function anyPageHasThumb(doc) {
  return doc.getPages().some((p) => p.node.get(PDFName.of('Thumb')) !== undefined);
}

export function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT FAILED:', msg);
    process.exit(1);
  }
}
