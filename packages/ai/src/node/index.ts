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

/**
 * Node.js platform adapter using onnxruntime-node and fs APIs.
 * Runs everything directly on the main thread (no worker needed).
 */
class NodePlatformAdapter implements PlatformAdapter {
  private ort: any = null;

  private async getOrt() {
    if (!this.ort) {
      this.ort = await import('onnxruntime-node');
    }
    return this.ort;
  }

  async resolveBackend(preferred: AiBackend | 'auto'): Promise<AiBackend> {
    if (preferred !== 'auto') return preferred;
    return 'cpu';
  }

  async loadModel(
    url: string,
    options: SessionOptions,
    config: { cache: boolean },
    onProgress?: (progress: AdapterLoadProgress) => void,
  ): Promise<OnnxSession> {
    // Fetch model
    const buffer = await this.fetchModel(url, (loaded, total) => {
      onProgress?.({ stage: 'downloading', loaded, total });
    });

    // Create session
    onProgress?.({ stage: 'creating-session' });

    const ort = await this.getOrt();
    const backend = options.backend === 'webgpu' ? 'cpu' : options.backend;
    const session = await ort.InferenceSession.create(Buffer.from(buffer), {
      executionProviders: [backend],
      graphOptimizationLevel: 'all',
    });

    return {
      inputNames: [...session.inputNames],
      outputNames: [...session.outputNames],
      run: async (feeds: OnnxFeeds): Promise<OnnxOutputs> => {
        const ortFeeds: Record<string, unknown> = {};
        for (const [name, desc] of Object.entries(feeds)) {
          ortFeeds[name] = new ort.Tensor(desc.type, desc.data, desc.dims as number[]);
        }
        const result = await session.run(ortFeeds);
        return result as OnnxOutputs;
      },
      release: () => session.release(),
    };
  }

  async destroy(): Promise<void> {
    // Nothing to clean up for Node.js
  }

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

    const reader = (response.body as any).getReader();
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
    return result.buffer;
  }
}

/**
 * Create an AI runtime for Node.js environments.
 *
 * @example
 * ```typescript
 * import { createAiRuntime } from '@embedpdf/ai/node';
 *
 * const aiRuntime = createAiRuntime({
 *   backend: 'cpu',
 * });
 * ```
 */
export function createAiRuntime(config?: AiRuntimeConfig): AiRuntime {
  return new AiRuntime(new NodePlatformAdapter(), {
    backend: 'cpu',
    ...config,
  });
}

export { AiRuntime } from '../lib/runtime/ai-runtime';
