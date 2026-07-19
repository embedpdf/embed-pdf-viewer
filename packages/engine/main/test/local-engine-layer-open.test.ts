import { describe, expect, test } from 'vitest';
import {
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import { LocalEngine } from '../src/LocalEngine';
import type { Transport } from '../src/transport/Transport';

const openSecurity = {
  encryptionState: 'none',
  encryptionRequiresPassword: false,
  securityHandlerRevision: null,
  pdfPermissionsBits: 0xffffffff,
  pdfPermissionsAllAllowed: true,
  pdfOpenedAs: 'none',
  securityProbedAt: Date.now(),
} as const;

class RecordingTransport implements Transport {
  readonly sent: Array<WirePack<WorkerRequest>> = [];
  private readonly listeners = new Set<(msg: WorkerResponse) => void>();

  send(pack: WirePack<WorkerRequest>): void {
    this.sent.push(pack);
    const msg = pack.payload;
    queueMicrotask(() => {
      if (msg.kind === 'open.fatMem' || msg.kind === 'open.layerMemBase') {
        this.deliver({
          kind: 'resolve',
          jobId: msg.jobId,
          result: { tag: 'open', docId: msg.docId, security: openSecurity },
        });
        return;
      }
      if (msg.kind === 'document.saveLayerBuffer') {
        this.deliver({
          kind: 'resolve',
          jobId: msg.jobId,
          result: {
            tag: 'document.saveLayerBuffer',
            bytes: new Uint8Array([5, 5, 5]).buffer,
            size: 3,
          },
        });
        return;
      }
      if (msg.kind === 'close') {
        this.deliver({ kind: 'resolve', jobId: msg.jobId, result: { tag: 'close' } });
        return;
      }
      if (msg.kind === 'shutdown') {
        this.deliver({ kind: 'resolve', jobId: msg.jobId, result: { tag: 'shutdown' } });
        return;
      }
      this.deliver({
        kind: 'reject',
        jobId: msg.jobId,
        error: {
          name: 'EngineError',
          code: 'Unknown',
          message: `unexpected request ${msg.kind}`,
        },
      });
    });
  }

  onMessage(handler: (msg: WorkerResponse) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async terminate(): Promise<void> {
    this.listeners.clear();
  }

  private deliver(msg: WorkerResponse): void {
    for (const listener of this.listeners) listener(msg);
  }
}

describe('LocalEngine layer open', () => {
  test('keeps the normal bytes path on open.fatMem', async () => {
    const transport = new RecordingTransport();
    const engine = LocalEngine.fromTransport({ transport });

    const handle = await engine.open({
      kind: 'bytes',
      id: 'doc-fat',
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(handle.id).toBe('doc-fat');
    expect(transport.sent).toHaveLength(1);
    const pack = transport.sent[0]!;
    expect(pack.payload).toMatchObject({ kind: 'open.fatMem', docId: 'doc-fat' });
    expect(pack.transfer).toHaveLength(1);

    await handle.close();
    await engine.destroy();
  });

  test('opens a fresh layer from browser memory base bytes', async () => {
    const transport = new RecordingTransport();
    const engine = LocalEngine.fromTransport({ transport });
    const baseBytes = new Uint8Array([9, 8, 7]);

    const handle = await engine.open({
      kind: 'layerBytes',
      id: 'doc-layer-a',
      baseKey: 'shared-base',
      baseBytes,
    });

    expect(handle.id).toBe('doc-layer-a');
    expect(transport.sent).toHaveLength(1);
    const pack = transport.sent[0]!;
    expect(pack.payload).toMatchObject({
      kind: 'open.layerMemBase',
      docId: 'doc-layer-a',
      baseKey: 'shared-base',
      layer: { kind: 'fresh' },
    });
    expect(pack.transfer).toHaveLength(1);

    await handle.close();
    await engine.destroy();
  });

  test('opens an existing layer artifact with a small memory-backed artifact', async () => {
    const transport = new RecordingTransport();
    const engine = LocalEngine.fromTransport({ transport });
    const baseBytes = new Uint8Array([1, 1, 1]);
    const artifactBytes = new Uint8Array([2, 2]);

    const handle = await engine.open({
      kind: 'layerBytes',
      id: 'doc-layer-b',
      baseKey: 'shared-base',
      baseBytes,
      layer: { kind: 'artifact', bytes: artifactBytes },
    });

    expect(handle.id).toBe('doc-layer-b');
    expect(transport.sent).toHaveLength(1);
    const pack = transport.sent[0]!;
    expect(pack.payload).toMatchObject({
      kind: 'open.layerMemBase',
      docId: 'doc-layer-b',
      baseKey: 'shared-base',
      layer: { kind: 'artifact' },
    });
    expect(pack.transfer).toHaveLength(2);
    if (pack.payload.kind === 'open.layerMemBase' && pack.payload.layer.kind === 'artifact') {
      expect(pack.payload.layer.bytes).toBe(pack.transfer[1]);
    }

    await handle.close();
    await engine.destroy();
  });

  test('downloadLayer() exports the layer artifact via document.saveLayerBuffer', async () => {
    const transport = new RecordingTransport();
    const engine = LocalEngine.fromTransport({ transport });

    const handle = await engine.open({
      kind: 'layerBytes',
      id: 'doc-export',
      baseBytes: new Uint8Array([1, 2, 3]),
      layer: { kind: 'fresh' },
    });

    const bytes = await handle.downloadLayer!();
    expect(Array.from(bytes)).toEqual([5, 5, 5]);

    const saveReq = transport.sent.find((p) => p.payload.kind === 'document.saveLayerBuffer');
    expect(saveReq?.payload).toMatchObject({
      kind: 'document.saveLayerBuffer',
      docId: 'doc-export',
    });

    await handle.close();
    await engine.destroy();
  });
});
