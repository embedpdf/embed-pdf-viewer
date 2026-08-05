import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  readdir,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  MaterializeOpts,
  MaterializeResult,
  ObjectBody,
  ObjectStat,
  ObjectStore,
  PresignedDownload,
  PresignedUpload,
  PresignUploadOpts,
} from '../ObjectStore';

export interface FsObjectStoreOptions {
  /** Absolute path to the root directory all keys live under. */
  root: string;
}

/**
 * Filesystem-backed object store.
 *
 * Operational behaviour:
 *   - PUT writes to `<root>/<key>.partial`, hash-streams the bytes,
 *     then atomic-renames into `<root>/<key>` once the SHA-256 is
 *     computed. A killed process leaves a `.partial` behind, never a
 *     half-written `key`. The admin upload-direct route logs and GCs
 *     these on boot.
 *   - `deletePrefix` walks the tree depth-first and removes empty
 *     dirs as it unwinds. Concurrency: a parallel writer can race; we
 *     surface that as an `ENOENT` on the unlink and treat it as
 *     "already gone".
 *   - Presigned URLs are not supported (FS has no per-key auth model).
 *     The admin route picks the `upload-direct` flow when this adapter
 *     is active.
 *
 * Security: every key is `resolve`-joined to `root` and the result is
 * required to remain under `root` to prevent `../` traversal.
 */
export class FsObjectStore implements ObjectStore {
  readonly info: { kind: 'fs'; location: string; root: string };
  private readonly root: string;

  constructor(opts: FsObjectStoreOptions) {
    this.root = resolve(opts.root);
    this.info = { kind: 'fs', location: this.root, root: this.root };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const abs = this.absolute(key);
    try {
      const s = await stat(abs);
      if (!s.isFile()) return null;
      // We don't keep a sidecar with the SHA-256 in the FS adapter;
      // `etag` is the mtime-based weak identifier. `getSha256` does
      // the heavy lift on demand.
      return { size: s.size, etag: `mt-${s.mtimeMs.toFixed(0)}-${s.size}` };
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  async put(
    key: string,
    body: ObjectBody,
    opts: { contentLength: number; contentType?: string },
  ): Promise<{ sha256: string }> {
    const abs = this.absolute(key);
    await mkdir(dirname(abs), { recursive: true });
    const partial = `${abs}.partial`;

    const hash = createHash('sha256');
    let written = 0;

    if (body instanceof Uint8Array) {
      hash.update(body);
      written = body.byteLength;
      await writeFile(partial, body);
    } else {
      const readable = body as Readable;
      const writer = createWriteStream(partial);
      readable.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        written += chunk.byteLength;
      });
      await pipeline(readable, writer);
    }

    if (written !== opts.contentLength) {
      await safeUnlink(partial);
      throw new Error(
        `FsObjectStore.put: declared contentLength=${opts.contentLength} but wrote ${written}`,
      );
    }

    await rename(partial, abs);
    return { sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const abs = this.absolute(key);
    try {
      const buf = await readFile(abs);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  async getSha256(key: string): Promise<string | null> {
    const abs = this.absolute(key);
    try {
      const buf = await readFile(abs);
      return createHash('sha256').update(buf).digest('hex');
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  async presignUpload(
    _key: string,
    _ttlSec: number,
    _opts: PresignUploadOpts,
  ): Promise<PresignedUpload | null> {
    return null;
  }

  async presignDownload(_key: string, _ttlSec: number): Promise<PresignedDownload | null> {
    return null;
  }

  async delete(key: string): Promise<boolean> {
    const abs = this.absolute(key);
    try {
      await unlink(abs);
      await this.removeEmptyAncestors(dirname(abs));
      return true;
    } catch (err) {
      if (isENOENT(err)) return false;
      throw err;
    }
  }

  async materializeLocal(
    key: string,
    destPath: string,
    opts: MaterializeOpts,
  ): Promise<MaterializeResult> {
    const src = this.absolute(key);
    await mkdir(dirname(destPath), { recursive: true });
    const partial = `${destPath}.partial.${randomBytes(6).toString('hex')}`;
    let size = 0;
    const hash = createHash('sha256');
    try {
      const reader = createReadStream(src);
      const writer = createWriteStream(partial);
      reader.on('data', (chunk: string | Buffer) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        size += buf.byteLength;
        hash.update(buf);
      });
      // node's `pipeline` propagates abort via destroy(); the AbortSignal
      // is plumbed through the underlying streams below for correctness.
      if (opts.signal) {
        if (opts.signal.aborted) {
          reader.destroy();
          throw new Error('materializeLocal aborted');
        }
        const onAbort = () => {
          reader.destroy(new Error('materializeLocal aborted'));
        };
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      await pipeline(reader, writer);
      const sha = hash.digest('hex');
      if (sha !== opts.expectedSha) {
        await safeUnlink(partial);
        throw new Error(
          `FsObjectStore.materializeLocal: sha mismatch for ${key} ` +
            `(expected ${opts.expectedSha}, got ${sha})`,
        );
      }
      await rename(partial, destPath);
      return { path: destPath, size, sha256: sha };
    } catch (err) {
      await safeUnlink(partial);
      throw err;
    }
  }

  async deletePrefix(prefix: string): Promise<{ deleted: number }> {
    const abs = this.absoluteDir(prefix);
    let deleted = 0;
    try {
      deleted = await this.walkDelete(abs);
    } catch (err) {
      if (isENOENT(err)) return { deleted: 0 };
      throw err;
    }
    await this.removeEmptyAncestors(dirname(abs));
    return { deleted };
  }

  private async walkDelete(abs: string): Promise<number> {
    let s;
    try {
      s = await stat(abs);
    } catch (err) {
      if (isENOENT(err)) return 0;
      throw err;
    }
    if (s.isFile()) {
      await safeUnlink(abs);
      return 1;
    }
    if (!s.isDirectory()) return 0;
    let count = 0;
    const entries = await readdir(abs);
    for (const entry of entries) {
      count += await this.walkDelete(join(abs, entry));
    }
    try {
      await rmdir(abs);
    } catch (err) {
      // Concurrent writers could re-create entries while we drain;
      // a non-empty rmdir failure is acceptable, the directory is
      // effectively gone for our caller's purposes.
      if (!isENOTEMPTY(err) && !isENOENT(err)) throw err;
    }
    return count;
  }

  private async removeEmptyAncestors(dir: string): Promise<void> {
    let cur = dir;
    while (cur.length > this.root.length && cur.startsWith(this.root)) {
      try {
        await rmdir(cur);
      } catch {
        return;
      }
      cur = dirname(cur);
    }
  }

  /**
   * Resolve and validate that `key` stays under `root`. Throws on any
   * attempt to escape (e.g. `..` segments, absolute keys).
   */
  private absolute(key: string): string {
    if (!key || key.startsWith('/') || key.includes('\0')) {
      throw new Error(`FsObjectStore: invalid key "${key}"`);
    }
    const abs = resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error(`FsObjectStore: key "${key}" escapes root`);
    }
    return abs;
  }

  private absoluteDir(prefix: string): string {
    return this.absolute(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
  }

  /**
   * Reserved for future scrubber: walk the entire root, delete every
   * `*.partial` file older than `olderThanMs`. Wired in once we have
   * a background sweeper service.
   */
  async sweepPartials(olderThanMs: number): Promise<number> {
    return this.scanPartials(this.root, olderThanMs, 0);
  }

  private async scanPartials(dir: string, olderThanMs: number, count: number): Promise<number> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isENOENT(err)) return count;
      throw err;
    }
    let acc = count;
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        acc = await this.scanPartials(abs, olderThanMs, acc);
        continue;
      }
      if (!e.isFile() || !e.name.endsWith('.partial')) continue;
      try {
        const s = await stat(abs);
        if (Date.now() - s.mtimeMs > olderThanMs) {
          await safeUnlink(abs);
          acc++;
        }
      } catch (err) {
        if (!isENOENT(err)) throw err;
      }
    }
    return acc;
  }

  /** Clear everything under root. Used by tests. */
  async _wipeForTest(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
    await mkdir(this.root, { recursive: true });
  }
}

function isENOENT(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ENOENT';
}

function isENOTEMPTY(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ENOTEMPTY';
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if (!isENOENT(err)) throw err;
  }
}
