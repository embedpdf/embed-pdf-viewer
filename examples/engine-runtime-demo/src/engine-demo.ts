import type { DocumentMetadata } from '@embedpdf/engine-core';
import type { Engine } from '@embedpdf/engine-core/runtime';

export interface EngineDemoResult {
  label: string;
  docId: string;
  metadata: DocumentMetadata;
  /** Total elapsed ms, including open + metadata.read + close. */
  elapsedMs: number;
}

/**
 * Open the bytes, read metadata, close. Identical for local + cloud because
 * Engine v3 is the same surface on both sides.
 */
export async function runEngineDemo(
  label: string,
  engine: Engine,
  pdfBytes: Uint8Array,
  docId = `demo-${label}`,
): Promise<EngineDemoResult> {
  const started = Date.now();
  const doc = await engine.open({ kind: 'bytes', id: docId, bytes: pdfBytes });
  try {
    const metadata = await doc.metadata.get();
    return { label, docId: doc.id, metadata, elapsedMs: Date.now() - started };
  } finally {
    await doc.close();
  }
}

/**
 * Compare two metadata reads field-by-field. The key v3 invariant is that
 * the local engine (WASM) and cloud engine (HTTP -> native) return identical
 * DocumentMetadata for the same input.
 */
export function diffMetadata(a: DocumentMetadata, b: DocumentMetadata): string[] {
  const keys: (keyof DocumentMetadata)[] = [
    'title',
    'author',
    'subject',
    'keywords',
    'producer',
    'creator',
    'createdAt',
    'modifiedAt',
    'trapped',
  ];
  const diffs: string[] = [];
  for (const k of keys) {
    if (a[k] !== b[k]) diffs.push(`${k}: ${JSON.stringify(a[k])} !== ${JSON.stringify(b[k])}`);
  }
  return diffs;
}
