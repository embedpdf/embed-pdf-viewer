import {
  EngineError,
  EngineErrorCode,
  type PageImageOptions,
  type PageImageResult,
  type PageRaster,
  type PageRenderEncodedFormat,
} from '@embedpdf/engine-core/runtime';

import { encodeBmp } from './bmp';

export interface LocalImageEncoder {
  encode(
    raster: PageRaster,
    options: PageImageOptions,
    signal: AbortSignal,
  ): Promise<PageImageResult>;
  destroy?(): void;
}

interface PendingEncode {
  resolve: (bytes: Uint8Array) => void;
  reject: (error: unknown) => void;
}

type EncodeWorkerMessage =
  | { id: string; ok: true; bytes: ArrayBuffer }
  | { id: string; ok: false; error: string };

const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { id, raster, format, quality } = event.data;
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas is not available in this worker');
    }
    const bytes = raster.data;
    const image = new ImageData(new Uint8ClampedArray(bytes), raster.width, raster.height);
    const canvas = new OffscreenCanvas(raster.width, raster.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable');
    ctx.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/' + format, quality });
    const encoded = await blob.arrayBuffer();
    self.postMessage({ id, ok: true, bytes: encoded }, [encoded]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
`;

export class BrowserImageEncoder implements LocalImageEncoder {
  private readonly pending = new Map<string, PendingEncode>();
  private workers: Worker[] = [];
  private workerUrl: string | null = null;
  private nextWorker = 0;
  private nextId = 1;
  private disabledWorkerPath = false;

  constructor(private readonly opts: { workerCount?: number } = {}) {}

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
        this.disabledWorkerPath = true;
        this.destroy();
        throw error;
      }
    }
    return await encodeOnMainThread(raster, format, quality, signal);
  }

  private canUseWorkerPath(): boolean {
    return (
      typeof Worker !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    );
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
      worker.postMessage(
        {
          id,
          raster: { width: raster.width, height: raster.height, data: raster.data },
          format,
          quality,
        },
        [raster.data],
      );
    });
  }

  private ensureWorkers(): void {
    if (this.workers.length > 0) return;
    this.workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const count = Math.max(1, this.opts.workerCount ?? 2);
    for (let i = 0; i < count; i++) {
      const worker = new Worker(this.workerUrl);
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
