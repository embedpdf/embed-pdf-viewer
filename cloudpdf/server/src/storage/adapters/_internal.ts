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
import { createReadStream } from 'node:fs';
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline, Transform, type Readable } from 'node:stream';

import { ShaMismatchError, type MaterializeOpts, type MaterializeResult } from '../ObjectStore';

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

/**
 * The body wrapper for a STREAMED `put`. Hashes and counts the bytes
 * as they flow toward the backend, enforcing the declared
 * content-length exactly:
 *
 *   - one byte over `declared` errors the body mid-stream, so the
 *     backend aborts its upload and no visible object materializes;
 *   - a source that ends short errors in `flush` — BEFORE downstream
 *     ever sees EOF — so single-shot backends can never finalize an
 *     undersized object;
 *   - `sha256()` is defined only after a full, exact-length flush. A
 *     backend upload call that resolved implies EOF was consumed,
 *     which implies the flush ran (adapters rely on this order);
 *   - `error()` hands back the body/source failure so adapters can
 *     rethrow OUR precise content-length error instead of whatever
 *     wrapper the SDK put around the aborted request.
 */
export interface CountedSha256Body {
  /** Pass this to the backend SDK as the upload body. */
  readonly body: Transform;
  /** SHA-256 hex of the streamed bytes. Throws before full flush. */
  sha256(): string;
  /** First body/source failure, if any. */
  error(): Error | null;
}

/** See {@link CountedSha256Body}. `label` prefixes error messages. */
export function countedSha256Body(
  source: Readable,
  declared: number,
  label: string,
): CountedSha256Body {
  const hash = createHash('sha256');
  let written = 0;
  let digest: string | null = null;
  let failure: Error | null = null;

  const body = new Transform({
    transform(chunk, _enc, cb) {
      const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array);
      written += buf.byteLength;
      if (written > declared) {
        cb(new Error(`${label}: declared contentLength=${declared} but received more`));
        return;
      }
      hash.update(buf);
      cb(null, buf);
    },
    flush(cb) {
      if (written !== declared) {
        cb(new Error(`${label}: declared contentLength=${declared} but got ${written}`));
        return;
      }
      digest = hash.digest('hex');
      cb();
    },
  });
  // Capture the first failure (and keep 'error' handled so a backend
  // that abandons the stream can't crash the process).
  body.on('error', (err) => {
    failure ??= err instanceof Error ? err : new Error(String(err));
  });
  // pipeline (vs .pipe) propagates errors BOTH ways: a source failure
  // destroys the body (the backend sees the error), and a backend
  // abort destroys the source.
  pipeline(source, body, () => {
    /* outcome observed via body 'error' / flush */
  });

  return {
    body,
    sha256: () => {
      if (digest === null) {
        throw new Error(`${label}: body was not fully consumed; SHA-256 unavailable`);
      }
      return digest;
    },
    error: () => failure,
  };
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

  // A backend-recorded SHA that already disagrees with the caller's
  // expectation can never produce a valid file — fail before paying
  // for the download.
  if (source.knownSha256 && source.knownSha256 !== opts.expectedSha) {
    throw new ShaMismatchError(`${label}.materializeLocal`, opts.expectedSha, source.knownSha256);
  }

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
  let fhOpen = true;
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
          // Positional writes may land short of the full buffer; a
          // silently dropped tail would only surface as PDFium reading
          // garbage, so loop until every byte is on disk.
          let done = 0;
          while (done < buf.byteLength) {
            const { bytesWritten } = await fh.write(
              buf,
              done,
              buf.byteLength - done,
              offset + done,
            );
            if (bytesWritten <= 0) {
              throw new Error(`${label}.materializeLocal: short write at offset ${offset + done}`);
            }
            done += bytesWritten;
          }
          offset += buf.byteLength;
        }
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, ranges.length || 1) }, () =>
      worker(),
    );
    await Promise.all(workers);

    // The handle was opened write-only and the ranges landed out of
    // order, so the hash can't be computed inline or through `fh`.
    // Close first, then (when the backend recorded no SHA on PUT —
    // every presigned browser upload) stream-hash the finished partial
    // from disk before promoting it.
    fhOpen = false;
    await fh.close();

    let materialisedSha = source.knownSha256;
    if (!materialisedSha) {
      materialisedSha = await streamingSha256(createReadStream(partial));
    }
    if (materialisedSha !== opts.expectedSha) {
      throw new ShaMismatchError(`${label}.materializeLocal`, opts.expectedSha, materialisedSha);
    }
    await rename(partial, destPath);
    return { path: destPath, size, sha256: materialisedSha };
  } catch (err) {
    if (fhOpen) {
      try {
        await fh.close();
      } catch {
        // the write failure is the interesting error — ignore
      }
    }
    await safeUnlink(partial);
    throw err;
  }
}
