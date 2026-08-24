import fs from 'node:fs';

import type { DocsSection } from './types';

/**
 * `search-index.bin` — the per-deploy search artifact.
 *
 *   bytes 0–3   magic 'DKSI'
 *   u32 LE      format version
 *   u32 LE      metadata byte length
 *   …           metadata JSON (utf-8), zero-padded to a 4-byte boundary
 *   …           Float32 LE vector matrix, `vectorCount × dimensions`,
 *               every row L2-normalized at build so cosine = dot product
 *
 * The metadata carries every section verbatim plus its derived lexical
 * fields, so the request path never re-runs extraction. A section's
 * `vectorRow` indexes into the matrix; -1 means lexical-only (no key at
 * build time, or a tolerated embedding failure).
 */

const MAGIC = 'DKSI';
export const SEARCH_ARTIFACT_VERSION = 1;

export type SearchArtifactSection = DocsSection & {
  /** `contentPath#anchor` — stable across builds. */
  id: string;
  /** Hash of the embedding text; the vector-reuse key across builds. */
  hash: string;
  symbolsText: string;
  variantProseText: string;
  /** Row into the vector matrix; -1 when this section has no embedding. */
  vectorRow: number;
};

export type SearchArtifactMeta = {
  version: number;
  /** Embedding model, or null for a lexical-only artifact. */
  model: string | null;
  dimensions: number;
  vectorCount: number;
  builtAt: string;
  revision: string;
  sections: SearchArtifactSection[];
};

export function writeSearchArtifact(
  filePath: string,
  meta: SearchArtifactMeta,
  vectors: Float32Array,
): void {
  if (vectors.length !== meta.vectorCount * meta.dimensions) {
    throw new Error(
      `Vector matrix is ${vectors.length} floats; expected ` +
        `${meta.vectorCount} × ${meta.dimensions}.`,
    );
  }

  const metaBytes = Buffer.from(JSON.stringify(meta), 'utf-8');
  const header = Buffer.alloc(12);
  header.write(MAGIC, 0, 'ascii');
  header.writeUInt32LE(SEARCH_ARTIFACT_VERSION, 4);
  header.writeUInt32LE(metaBytes.length, 8);

  const padding = Buffer.alloc((4 - ((12 + metaBytes.length) % 4)) % 4);
  const matrix = Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength);

  fs.writeFileSync(filePath, Buffer.concat([header, metaBytes, padding, matrix]));
}

export type LoadedSearchArtifact = {
  meta: SearchArtifactMeta;
  vectors: Float32Array;
};

export function loadSearchArtifact(filePath: string): LoadedSearchArtifact {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== MAGIC) {
    throw new Error(`${filePath} is not a search artifact.`);
  }
  const version = buffer.readUInt32LE(4);
  if (version !== SEARCH_ARTIFACT_VERSION) {
    throw new Error(
      `${filePath} is artifact format v${version}; this build reads v${SEARCH_ARTIFACT_VERSION}. Rebuild the index.`,
    );
  }

  const metaLength = buffer.readUInt32LE(8);
  const meta = JSON.parse(buffer.toString('utf-8', 12, 12 + metaLength)) as SearchArtifactMeta;

  const dataOffset = 12 + metaLength + ((4 - ((12 + metaLength) % 4)) % 4);
  const floatCount = meta.vectorCount * meta.dimensions;
  const start = buffer.byteOffset + dataOffset;

  // Node pools small file reads into shared slabs, so the matrix view must
  // respect the Buffer's own offset — and fall back to a copy if the slab
  // ever leaves it misaligned.
  const vectors =
    start % 4 === 0
      ? new Float32Array(buffer.buffer, start, floatCount)
      : new Float32Array(buffer.subarray(dataOffset, dataOffset + floatCount * 4)).slice();

  return { meta, vectors };
}
