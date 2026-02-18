import { AiRuntime } from '../lib/runtime/ai-runtime';
import {
  AdapterLoadProgress,
  AiBackend,
  AiRuntimeConfig,
  OnnxFeeds,
  OnnxOutputs,
  OnnxSession,
  PlatformAdapter,
  SessionOptions,
} from '../lib/runtime/types';

declare global {
  interface Navigator {
    gpu?: { requestAdapter(): Promise<unknown | null> };
  }
}

const CACHE_NAME = 'embedpdf-ai-models';

/**
 * Web platform adapter using onnxruntime-web/webgpu.
 *
 * - Imports `onnxruntime-web/webgpu` which includes both WebGPU and WASM backends.
 * - Uses `navigator.gpu` for reliable WebGPU detection.
 * - Enables `ort.env.wasm.proxy = true` for WASM so that session creation
 *   and inference run in ONNX Runtime's internal web worker, preventing UI freezes.
 */
class WebPlatformAdapter implements PlatformAdapter {
  private ort: typeof import('onnxruntime-web/webgpu') | null = null;

  constructor(private wasmPaths?: string) {}

  private async getOrt() {
    if (!this.ort) {
      this.ort = await import('onnxruntime-web/webgpu');

      // Configure WASM paths if provided
      if (this.wasmPaths) {
        this.ort.env.wasm.wasmPaths = this.wasmPaths;
      }
    }
    return this.ort;
  }

  async resolveBackend(preferred: AiBackend | 'auto'): Promise<AiBackend> {
    if (preferred !== 'auto') return preferred;

    // Check WebGPU availability via navigator.gpu
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) return 'webgpu';
      } catch {
        // WebGPU not available
      }
    }
    return 'wasm';
  }

  async loadModel(
    url: string,
    options: SessionOptions,
    config: { cache: boolean },
    onProgress?: (progress: AdapterLoadProgress) => void,
  ): Promise<OnnxSession> {
    const ort = await this.getOrt();

    // Enable WASM proxy so session creation + inference run in
    // ONNX Runtime's internal worker thread, preventing UI freezes.
    if (options.backend === 'wasm' || options.backend === 'cpu') {
      ort.env.wasm.proxy = true;
    }

    // Try cache first
    let buffer: ArrayBuffer | null = null;
    if (config.cache) {
      buffer = await this.cacheGet(url).catch(() => null);
    }

    if (!buffer) {
      buffer = await this.fetchModel(url, (loaded, total) => {
        onProgress?.({ stage: 'downloading', loaded, total });
      });

      if (config.cache) {
        await this.cacheSet(url, buffer).catch(() => {});
      }
    } else {
      onProgress?.({ stage: 'downloading', loaded: 1, total: 1 });
    }

    // Create session
    onProgress?.({ stage: 'creating-session' });

    const provider = options.backend === 'cpu' ? 'wasm' : options.backend;
    const session = await ort.InferenceSession.create(new Uint8Array(buffer), {
      executionProviders: [provider],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    });

    return {
      inputNames: [...session.inputNames],
      outputNames: [...session.outputNames],
      run: async (feeds: OnnxFeeds): Promise<OnnxOutputs> => {
        const ortFeeds: Record<string, InstanceType<typeof ort.Tensor>> = {};
        for (const [name, desc] of Object.entries(feeds)) {
          ortFeeds[name] = new ort.Tensor(desc.type, desc.data, desc.dims);
        }
        const result = await session.run(ortFeeds);
        return result as OnnxOutputs;
      },
      release: () => session.release(),
    };
  }

  async destroy(): Promise<void> {
    // Nothing to clean up — ONNX Runtime manages its own proxy worker.
  }

  // ─── Private Helpers ──────────────────────────────────────

  private async fetchModel(
    url: string,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.body || !contentLength || !onProgress) {
      return response.arrayBuffer();
    }

    // Stream with progress
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(received, contentLength);
    }

    const result = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer as ArrayBuffer;
  }

  private async cacheGet(key: string): Promise<ArrayBuffer | null> {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(key);
      if (response) return response.arrayBuffer();
    } catch {
      // Cache API not available
    }
    return null;
  }

  private async cacheSet(key: string, data: ArrayBuffer): Promise<void> {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, new Response(data));
    } catch {
      // Cache API not available
    }
  }
}

/**
 * Create an AI runtime for browser environments.
 *
 * Uses `onnxruntime-web/webgpu` for both WebGPU and WASM backends.
 * When using WASM, enables `ort.env.wasm.proxy` so that model compilation
 * and inference run in ONNX Runtime's internal web worker, preventing UI freezes.
 *
 * @example
 * ```typescript
 * import { createAiRuntime } from '@embedpdf/ai/web';
 *
 * const aiRuntime = createAiRuntime({
 *   backend: 'auto',
 *   cache: true,
 *   onProgress: (progress) => {
 *     if (progress.stage === 'downloading') {
 *       console.log(`${progress.modelId}: ${((progress.loaded/progress.total)*100).toFixed(0)}%`);
 *     } else {
 *       console.log(`${progress.modelId}: creating session...`);
 *     }
 *   },
 * });
 * ```
 */
export function createAiRuntime(config?: AiRuntimeConfig): AiRuntime {
  const adapter = new WebPlatformAdapter(config?.wasmPaths);
  return new AiRuntime(adapter, config);
}

export { AiRuntime } from '../lib/runtime/ai-runtime';
