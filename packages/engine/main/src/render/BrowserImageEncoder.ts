import {
  EngineError,
  EngineErrorCode,
  type PageImageOptions,
  type PageImageResult,
  type PageRaster,
  type PageRenderEncodedFormat,
} from '@embedpdf/engine-core/runtime';

import { toAbsoluteUrl } from '../wasm-source';
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
 * - `'inline'` (default): blob URL from {@link encoderWorkerSource} — zero
 *   config, needs `worker-src blob:` under a strict CSP. If the CSP blocks
 *   it, encoding degrades gracefully to the main thread (same call).
 * - a URL string: same-origin static `encoder-worker.js` (strict CSP; copy it
 *   from this package's `workers/` directory).
 * - a factory: full control over Worker creation.
 * - `false`: no pool — always encode on the main thread.
 */
export type EncoderWorkerSource = 'inline' | string | (() => Worker) | false;

export interface BrowserImageEncoderOptions {
  /** Number of workers in the pool (default 2). */
  workerCount?: number;
  /** Worker delivery — see {@link EncoderWorkerSource}. Default `'inline'`. */
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
  private workerUrl: string | null = null;
  private nextWorker = 0;
  private nextId = 1;
  private disabledWorkerPath = false;
  /** True once the pool has completed one round-trip. Until then every post
   *  COPIES the raster (no transfer) so a CSP-blocked or broken pool can fall
   *  back to main-thread encoding within the same call — the caller's buffer
   *  is still intact. */
  private poolVerified = false;

  constructor(private readonly opts: BrowserImageEncoderOptions = {}) {}

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
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    this.workerUrl = null;
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
        // The pool never worked (e.g. a CSP without `worker-src blob:`
        // rejected the blob worker). The raster was sent as a COPY, so the
        // buffer is intact — degrade to main-thread encoding in this call.
        this.disabledWorkerPath = true;
        this.destroy();
        warnWorkerFallback(error);
        return await encodeOnMainThread(raster, format, quality, signal);
      }
    }
    return await encodeOnMainThread(raster, format, quality, signal);
  }

  private canUseWorkerPath(): boolean {
    const source = this.opts.worker ?? 'inline';
    if (source === false) return false;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
    if (source === 'inline') {
      return (
        typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      );
    }
    return true;
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
    const source = this.opts.worker ?? 'inline';
    if (typeof source === 'function') return source();
    if (typeof source === 'string') return new Worker(toAbsoluteUrl(source));
    if (!this.workerUrl) {
      this.workerUrl = URL.createObjectURL(
        new Blob([encoderWorkerSource], { type: 'text/javascript' }),
      );
    }
    return new Worker(this.workerUrl);
  }
}

let warnedWorkerFallback = false;
function warnWorkerFallback(error: unknown): void {
  if (warnedWorkerFallback) return;
  warnedWorkerFallback = true;
  console.warn(
    '[embedpdf] image encoder workers are unavailable — falling back to main-thread ' +
      'encoding (slower under load). If your Content-Security-Policy blocks blob: ' +
      "workers, self-host @embedpdf/engine's workers/encoder-worker.js and pass " +
      "`encoderWorker: '/path/encoder-worker.js'` to localEngine(). " +
      'See https://www.embedpdf.com/docs/self-hosting —',
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
