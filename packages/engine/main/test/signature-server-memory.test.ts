/**
 * The server memory contract (native runtime, file base): preparing a
 * signature and judging the working copy never route document- or
 * layer-sized bytes through an owned buffer. They go through scratch files
 * beside the base, which are gone when the call returns. The owned-buffer
 * count is the contract; RSS is sampled as evidence, never as the test.
 */
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { InlineTransport, LazyTransport, LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = 16 * 1024 * 1024;

const OWNED_BUFFER_SAVES = [
  'EPDF_SaveDocumentToOwnedBuffer',
  'EPDF_SaveDocumentToOwnedBufferEx',
  'EPDFLayer_SaveDeltaToOwnedBuffer',
  'EPDFLayer_SaveDeltaToOwnedBufferEx',
  'EPDFLayer_SaveLayerArtifactToOwnedBuffer',
  'EPDFLayer_SaveLayerArtifactToOwnedBufferEx',
] as const;

let engine: LocalEngine | null = null;
let dir: string;
let basePath: string;
let ownedBufferSaves = 0;

/** The runtime with every owned-buffer save counted; everything else untouched. */
function spied(runtime: PdfRuntimeModule): PdfRuntimeModule {
  const fn = new Proxy(runtime.fn as unknown as Record<string, unknown>, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof key === 'string' && (OWNED_BUFFER_SAVES as readonly string[]).includes(key)) {
        return (...args: unknown[]) => {
          ownedBufferSaves += 1;
          return (value as (...a: unknown[]) => unknown)(...args);
        };
      }
      return value;
    },
  });
  return Object.create(runtime, { fn: { value: fn, enumerable: true } }) as PdfRuntimeModule;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'epdf-server-memory-'));
  basePath = join(dir, 'base.pdf');
  await copyFile(resolve(here, 'fixtures', 'unsigned_sigfield.pdf'), basePath);
  try {
    const runtime = await createPdfRuntime({ prefer: 'native' });
    if (runtime.kind !== 'native') {
      await runtime.destroy();
      console.warn('server memory tests skipped: native runtime unavailable');
      return;
    }
    const transport = new LazyTransport(async () => new InlineTransport(spied(runtime)));
    engine = LocalEngine.fromTransport({ transport });
  } catch (error) {
    if (!/native Node runtime|Native runtime/.test(String(error))) throw error;
    console.warn('server memory tests skipped: native runtime unavailable');
  }
});
afterAll(async () => {
  await engine?.destroy();
  await rm(dir, { recursive: true, force: true });
});

const scratchFiles = async (tag: string) => (await readdir(dir)).filter((f) => f.includes(`.${tag}-`));
const mib = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;

describe('server memory contract', () => {
  test('a large edit is prepared and judged through files, never through an owned buffer', async () => {
    if (!engine) return;
    const doc = await engine.open({ kind: 'layerFile', id: 'memory', basePath }, { scope: ['*'] });
    try {
      // A 16 MiB embedded file: the edit IS the payload. Random bytes, so no
      // filter shrinks it.
      const payload = new Uint8Array(PAYLOAD);
      for (let i = 0; i < payload.length; i += 4096) payload[i] = (i * 7919) & 0xff;
      for (let i = 1; i < payload.length; i++) payload[i] = (payload[i - 1]! * 1103515245 + 12345 + i) & 0xff;
      await doc.attachments.create!({ data: payload, name: 'blob.bin', mimeType: 'application/octet-stream' });

      // Preparing a signature: the candidate's layer is a scratch file beside
      // the base while the candidate is open, and gone when prepare returns.
      ownedBufferSaves = 0;
      const rssBefore = process.memoryUsage().rss;
      const prepared = await doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } });
      const rssAfterPrepare = process.memoryUsage().rss;
      expect(ownedBufferSaves).toBe(0);
      expect(await scratchFiles('signing')).toEqual(
        expect.arrayContaining([expect.stringContaining(`.signing-${prepared.signingId}.pdf`)]),
      );
      expect((await scratchFiles('signing')).filter((f) => f.endsWith('.layer'))).toEqual([]);
      await doc.signatures!.abort(prepared.signingId);
      expect(await scratchFiles('signing')).toEqual([]);

      // Judging the working copy: the delta goes to a scratch file and is
      // composed over the base in place; nothing is left behind.
      ownedBufferSaves = 0;
      const analysis = await doc.signatures!.analyze({
        since: { revisionIndex: 0 },
        until: 'working-copy',
      });
      const rssAfterAnalyze = process.memoryUsage().rss;
      expect(analysis.basis.source).toBe('working-copy');
      expect(ownedBufferSaves).toBe(0);
      expect(await scratchFiles('working-copy')).toEqual([]);

      console.log(
        `[server-memory] payload ${mib(PAYLOAD)}; rss prepare +${mib(rssAfterPrepare - rssBefore)}, analyze +${mib(rssAfterAnalyze - rssAfterPrepare)}`,
      );
      // Evidence, loosely bounded: a whole-layer buffer would add the payload
      // several times over.
      expect(rssAfterPrepare - rssBefore).toBeLessThan(4 * PAYLOAD);
    } finally {
      await doc.close();
    }
  });
});
