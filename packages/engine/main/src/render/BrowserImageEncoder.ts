import {
  EngineError,
  EngineErrorCode,
  type PageImageOptions,
  type PageImageResult,
  type PageRaster,
  type PageRenderEncodedFormat,
} from '@embedpdf/engine-core/runtime';

import { allowWorkerUrl, createWorkerBlobUrl, startWorker } from '../trusted-types';
import { toAbsoluteUrl } from '../wasm-source';
import { findEncoderWorkerFile } from '../worker-files';
import { encodeBmp } from './bmp';
import { encoderWorkerSource } from './encoder-worker-source';

export interface LocalImageEncoder {
  encode(
    raster: PageRaster,
    options: PageImageOptions,
    signal: AbortSignal,
  ): Promise<PageImageResult>;
  destroy?(): void;
}

/**
 * How the encoder pool's workers are delivered:
 * - omitted (default): this package's `workers/encoder-worker.js`, emitted by
 *   the consumer's bundler as a file of their build (`worker-src 'self'`);
 *   from a blob URL of {@link encoderWorkerSource} where the scripts are on
 *   another origin than the page. If the workers cannot start, encoding
 *   degrades gracefully to the main thread (same call).
 * - `'inline'`: always the blob URL (`worker-src blob:`), with the same fallback.
 * - a URL string: same-origin static `encoder-worker.js` (copy it from this
 *   package's `workers/` directory).
 * - a factory: full control over Worker creation.
 * - `false`: no pool — always encode on the main thread.
 */
export type EncoderWorkerSource = 'inline' | string | (() => Worker) | false;

export interface BrowserImageEncoderOptions {
  /** Number of workers in the pool (default 2). */
  workerCount?: number;
  /** Worker delivery — see {@link EncoderWorkerSource}. Default: the bundled file. */
  worker?: EncoderWorkerSource;
}

interface PendingEncode {
  resolve: (bytes: Uint8Array) => void;
  reject: (error: unknown) => void;
}

type EncodeWorkerMessage =
  | { id: string; ok: true; bytes: ArrayBuffer }
  | { id: string; ok: false; error: string };

export class BrowserImageEncoder implements LocalImageEncoder {
  private readonly pending = new Map<string, PendingEncode>();
  private workers: Worker[] = [];
  private blob: { url: string; revoke: () => void } | null = null;
  /** A configured URL string, absolute; allowed as a worker URL when configured. */
  private readonly configuredUrl: string | null;
  private nextWorker = 0;
  private nextId = 1;
  private disabledWorkerPath = false;
  /** True once the pool has completed one round-trip. Until then every post
   *  Copies the raster (no transfer) so a CSP-blocked or broken pool can fall
   *  back to main-thread encoding within the same call — the caller's buffer
   *  is still intact. */
  private poolVerified = false;

  constructor(private readonly opts: BrowserImageEncoderOptions = {}) {
    // The literal 'inline' is a string too, and must never be fetched as the
    // URL "/inline" (HTML: a SyntaxError that silently kills the pool).
    const source = opts.worker;
    this.configuredUrl =
      typeof source === 'string' && source !== 'inline' ? toAbsoluteUrl(source) : null;
    if (this.configuredUrl !== null) allowWorkerUrl(this.configuredUrl);
  }

  async encode(
    raster: PageRaster,
    options: PageImageOptions,
    signal: AbortSignal,
  ): Promise<PageImageResult> {
    const format = options.format ?? 'png';
    if (format === 'bmp') {
      return {
        width: raster.width,
        height: raster.height,
        format,
        contentType: 'image/bmp',
        source: {
          kind: 'bytes',
          bytes: encodeBmp(new Uint8Array(raster.data), raster.width, raster.height),
        },
      };
    }

    const bytes = await this.encodePngOrWebp(raster, format, options.quality, signal);
    return {
      width: raster.width,
      height: raster.height,
      format,
      contentType: contentType(format),
      source: { kind: 'bytes', bytes },
    };
  }

  destroy(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.blob?.revoke();
    this.blob = null;
    for (const task of this.pending.values()) {
      task.reject(new EngineError(EngineErrorCode.Aborted, 'image encoder destroyed'));
    }
    this.pending.clear();
  }

  private async encodePngOrWebp(
    raster: PageRaster,
    format: 'png' | 'webp',
    quality: number | undefined,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (!this.disabledWorkerPath && this.canUseWorkerPath()) {
      try {
        return await this.encodeInWorker(raster, format, quality, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        if (this.poolVerified) {
          // A previously working pool broke: keep the historical semantics
          // (surface the failure; later calls use the main thread).
          this.disabledWorkerPath = true;
          this.destroy();
          throw error;
        }
        // The pool never worked (a CSP that rejects the workers, a file the
        // bundler didn't emit). The raster was sent as a copy, so the buffer
        // is intact — degrade to main-thread encoding in this call.
        this.disabledWorkerPath = true;
        this.destroy();
        warnWorkerFallback(error);
        return await encodeOnMainThread(raster, format, quality, signal);
      }
    }
    return await encodeOnMainThread(raster, format, quality, signal);
  }

  private canUseWorkerPath(): boolean {
    if (this.opts.worker === false) return false;
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  }

  private encodeInWorker(
    raster: PageRaster,
    format: 'png' | 'webp',
    quality: number | undefined,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    this.ensureWorkers();
    const worker = this.workers[this.nextWorker++ % this.workers.length];
    const id = `img-${this.nextId++}`;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.pending.delete(id);
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new EngineError(EngineErrorCode.Aborted, 'image encoding aborted'));
      };
      this.pending.set(id, {
        resolve: (bytes) => {
          this.poolVerified = true;
          cleanup();
          resolve(bytes);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      // Transfer only once the pool is proven: before that, a copy crosses
      // the boundary so a failed pool can retry on the main thread.
      const data = this.poolVerified ? raster.data : raster.data.slice(0);
      worker.postMessage(
        {
          id,
          raster: { width: raster.width, height: raster.height, data },
          format,
          quality,
        },
        [data],
      );
    });
  }

  private ensureWorkers(): void {
    if (this.workers.length > 0) return;
    const count = Math.max(1, this.opts.workerCount ?? 2);
    for (let i = 0; i < count; i++) {
      const worker = this.createWorker();
      worker.onmessage = (event: MessageEvent<EncodeWorkerMessage>) => {
        const msg = event.data;
        const task = this.pending.get(msg.id);
        if (!task) return;
        if (msg.ok) task.resolve(new Uint8Array(msg.bytes));
        else task.reject(new EngineError(EngineErrorCode.RuntimeUnavailable, msg.error));
      };
      worker.onerror = (event) => {
        for (const task of this.pending.values()) {
          task.reject(new EngineError(EngineErrorCode.RuntimeUnavailable, event.message));
        }
        this.pending.clear();
      };
      this.workers.push(worker);
    }
  }

  private createWorker(): Worker {
    const source = this.opts.worker;
    if (typeof source === 'function') return source();
    if (this.configuredUrl !== null) return startWorker(this.configuredUrl);
    const file = source === undefined ? findEncoderWorkerFile() : null;
    if (file !== null) return startWorker(file);
    // 'inline', or the bundled file is on another origin than the page.
    this.blob ??= createWorkerBlobUrl(encoderWorkerSource);
    return startWorker(this.blob.url);
  }
}

let warnedWorkerFallback = false;
function warnWorkerFallback(error: unknown): void {
  if (warnedWorkerFallback) return;
  warnedWorkerFallback = true;
  console.warn(
    '[embedpdf] image encoder workers are unavailable — falling back to main-thread ' +
      'encoding (slower under load). If your bundler did not emit ' +
      "@embedpdf/engine's workers/encoder-worker.js, or your Content-Security-Policy blocks " +
      "the workers, serve that file yourself and pass `encoderWorker: '/path/encoder-worker.js'` " +
      'to localEngine(). See https://www.embedpdf.com/docs/viewer/self-hosting —',
    error,
  );
}

async function encodeOnMainThread(
  raster: PageRaster,
  format: 'png' | 'webp',
  quality: number | undefined,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw new EngineError(EngineErrorCode.Aborted, 'image encoding aborted');
  if (typeof document === 'undefined' || typeof ImageData === 'undefined') {
    throw new EngineError(
      EngineErrorCode.RuntimeUnavailable,
      'Canvas image encoding is unavailable in this environment',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new EngineError(EngineErrorCode.RuntimeUnavailable, '2D canvas context is unavailable');
  }
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('canvas.toBlob returned null'))),
      contentType(format),
      quality,
    );
  });
  if (signal.aborted) throw new EngineError(EngineErrorCode.Aborted, 'image encoding aborted');
  return new Uint8Array(await blob.arrayBuffer());
}

function contentType(format: PageRenderEncodedFormat): string {
  return `image/${format}`;
}
