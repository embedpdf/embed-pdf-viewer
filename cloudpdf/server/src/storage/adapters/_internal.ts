/**
 * Shared internals for the remote ObjectStore adapters (S3 / GCS /
 * Azure Blob). NOT an adapter — the leading underscore marks it as
 * package-private scaffolding.
 *
 * Why this exists: `put`/`getSha256`/`materializeLocal` are byte-for-
 * byte identical across the three cloud backends — only the actual
 * "fetch these bytes" / "write these bytes" SDK calls differ. Pulling
 * the orchestration (range fan-out, partial-file + atomic-rename,
 * SHA-256 verification, content-length checks) into one place means:
 *   - the atomicity + verify contract has exactly ONE implementation,
 *     so adapters can't drift from each other; and
 *   - each adapter shrinks to "construct client + map our ops to SDK
 *     calls", with no business logic to get subtly wrong.
 *
 * The `objectStoreConformance` harness then proves every adapter
 * (including FsObjectStore, which has its own simpler local-copy
 * materialize) honours the same observable contract.
 */

import { createHash, randomBytes } from 'node:crypto';
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import type { MaterializeOpts, MaterializeResult } from '../ObjectStore';

/**
 * Custom-metadata key under which every remote adapter stashes the
 * SHA-256 hex it computed on `put`. Read back on `getSha256` /
 * `materializeLocal` to skip a full re-hash.
 *
 * NB: this is the S3/GCS spelling. Azure blob metadata names must be
 * valid C# identifiers (no hyphens), so the Azure adapter uses its
 * own `xembedpdfsha256` key internally — the wire spelling is an
 * adapter-private detail, never surfaced to callers.
 */
export const SHA256_METADATA_KEY = 'x-embedpdf-sha256';

/** Hex SHA-256 of a fully-buffered payload. */
export function computeSha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Collect a Node `Readable` into a single `Uint8Array`. */
export async function drainReadable(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** SHA-256 hex over a stream without buffering it whole. */
export async function streamingSha256(stream: Readable): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of stream) {
    h.update(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return h.digest('hex');
}

/** `unlink` that swallows ENOENT (best-effort cleanup). */
export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'ENOENT') throw err;
  }
}

/**
 * A remote object as the range-materializer needs to see it. Adapters
 * supply these three facts; everything else (fan-out, file writing,
 * verification, atomicity) is handled by {@link materializeViaRanges}.
 */
export interface RangeMaterializeSource {
  /** Total object size in bytes (from a HEAD/getProperties call). */
  readonly size: number;
  /**
   * SHA-256 hex if the backend recorded it in object metadata on PUT,
   * else null. When present we trust it and skip re-hashing the
   * materialised file (saves a full re-read for large base PDFs).
   * When null we stream-hash the partial file before renaming.
   */
  readonly knownSha256: string | null;
  /**
   * Fetch the inclusive byte range `[start, end]` as a stream of
   * chunks. Must honour `signal` if supplied.
   */
  fetchRange(start: number, end: number, signal: AbortSignal | undefined): Promise<Readable>;
}

/**
 * Materialise a remote object to `destPath` via parallel range reads.
 *
 * Atomicity + verification contract (shared by every remote adapter):
 *   - bytes land in `${destPath}.partial.<random>` first; an atomic
 *     `rename` produces `destPath` only after the full payload wrote
 *     without error;
 *   - on ANY failure (range error, abort, sha mismatch) the partial
 *     is removed and the error rethrown — callers never see a
 *     half-written or unverified file;
 *   - the final bytes are verified against `opts.expectedSha`;
 *     mismatch throws (we never hand corrupt bytes to PDFium).
 *
 * Concurrency / chunk size default to 8 × 16 MiB; callers
 * (BaseFileCache, tests) override via `opts`.
 */
export async function materializeViaRanges(
  destPath: string,
  source: RangeMaterializeSource,
  opts: MaterializeOpts,
  label: string,
): Promise<MaterializeResult> {
  const { size } = source;
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const chunk = Math.max(1, opts.chunkSizeBytes ?? 16 * 1024 * 1024);
  await mkdir(dirname(destPath), { recursive: true });
  const partial = `${destPath}.partial.${randomBytes(6).toString('hex')}`;

  // Inclusive [start, end] ranges. A 0-byte object yields a single
  // empty range that the worker skips.
  const ranges: Array<{ start: number; end: number }> = [];
  if (size === 0) {
    ranges.push({ start: 0, end: -1 });
  } else {
    for (let off = 0; off < size; off += chunk) {
      ranges.push({ start: off, end: Math.min(off + chunk - 1, size - 1) });
    }
  }

  const fh = await open(partial, 'w');
  try {
    let nextRange = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        if (opts.signal?.aborted) throw new Error(`${label}.materializeLocal aborted`);
        const idx = nextRange++;
        if (idx >= ranges.length) return;
        const r = ranges[idx]!;
        if (r.end < r.start) continue; // empty-file edge case
        const stream = await source.fetchRange(r.start, r.end, opts.signal);
        let offset = r.start;
        for await (const piece of stream) {
          const buf = piece instanceof Buffer ? piece : Buffer.from(piece as Uint8Array);
          await fh.write(buf, 0, buf.byteLength, offset);
          offset += buf.byteLength;
        }
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, ranges.length || 1) }, () =>
      worker(),
    );
    await Promise.all(workers);

    let materialisedSha = source.knownSha256;
    if (!materialisedSha) {
      materialisedSha = await streamingSha256(fh.createReadStream({ start: 0 }));
    }
    if (materialisedSha !== opts.expectedSha) {
      await fh.close();
      await safeUnlink(partial);
      throw new Error(
        `${label}.materializeLocal: sha mismatch ` +
          `(expected ${opts.expectedSha}, got ${materialisedSha})`,
      );
    }
    await fh.close();
    await rename(partial, destPath);
    return { path: destPath, size, sha256: materialisedSha };
  } catch (err) {
    try {
      await fh.close();
    } catch {
      // already closed / never opened — ignore
    }
    await safeUnlink(partial);
    throw err;
  }
}
