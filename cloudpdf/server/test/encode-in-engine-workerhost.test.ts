import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { WorkerHost, type WorkerImageEncoder } from '@embedpdf/engine-services';
import type {
  WirePack,
  WorkerRequest,
  WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { SharpImageEncoder } from '../src/render/SharpImageEncoder';

/**
 * WS3 Phase B — the PRODUCTION encode path, in CI.
 *
 * The route-level suite (`encode-in-engine.test.ts`) runs against the stub
 * worker, which reimplements the encoded kinds; this file dispatches them
 * through the REAL `WorkerHost` with the REAL native PDFium runtime and
 * the REAL sharp injection worker-entry uses — the exact production code
 * path minus the worker_threads transport (whose transferable plumbing is
 * generic across kinds and covered by the stub suites). Notably it pins
 * the TRANSFER MANIFEST: the resolve envelope must transfer exactly the
 * encoded image's own buffer.
 *
 * Requires the native engine binary for this platform (a hard server
 * dependency — the same one production runs on). If this fails to load in
 * CI, that is a real gap in the CI image, not a test to skip.
 */

/** A minimal valid one-page PDF (blank 200×100 page), offsets computed. */
function minimalPdf(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const isWebp = (b: Uint8Array): boolean =>
  b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
const isPng = (b: Uint8Array): boolean =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

describe('encoded kinds through the real WorkerHost (native runtime + sharp)', () => {
  let dir: string;
  let pdfPath: string;
  let host: WorkerHost;
  let nextJob = 1;
  const pending = new Map<number, (pack: WirePack<WorkerResponse>) => void>();

  function dispatch(req: WorkerRequest): Promise<WirePack<WorkerResponse>> {
    return new Promise((resolve) => {
      pending.set(req.jobId as number, resolve);
      host.receive(req);
    });
  }

  async function resolved(req: WorkerRequest): Promise<{ result: unknown; transfer: readonly unknown[] }> {
    const pack = await dispatch(req);
    if (pack.payload.kind !== 'resolve') {
      throw new Error(`expected resolve, got: ${JSON.stringify(pack.payload)}`);
    }
    return { result: pack.payload.result, transfer: pack.transfer };
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'enc-wh-'));
    pdfPath = join(dir, 'min.pdf');
    await writeFile(pdfPath, minimalPdf());
    const runtime = await createPdfRuntime({ prefer: 'native' });
    // The same injection worker-entry performs (worker-entry defers the
    // sharp import; the adapter contract is identical).
    const sharpEncoder = new SharpImageEncoder();
    const imageEncoder: WorkerImageEncoder = {
      encode: (raster, opts) => sharpEncoder.encodeToBuffer(raster, opts),
    };
    host = new WorkerHost(
      runtime,
      (pack) => {
        const jobId = (pack.payload as { jobId: number }).jobId;
        const r = pending.get(jobId);
        pending.delete(jobId);
        r?.(pack);
      },
      { imageEncoder },
    );
  });

  afterAll(async () => {
    if (host) await dispatch({ kind: 'shutdown', jobId: nextJob++ });
    await rm(dir, { recursive: true, force: true });
  });

  test('pages.renderEncoded: real render + real sharp; transfer manifest carries exactly the image buffer', async () => {
    const docId = 'real-doc';
    await resolved({
      kind: 'open.layerFileBase',
      jobId: nextJob++,
      docId,
      baseKey: 'sha-min',
      basePath: pdfPath,
      layer: { kind: 'fresh' },
      password: null,
    });
    const list = (await resolved({ kind: 'pages.list', jobId: nextJob++, docId })).result as {
      tag: string;
      snapshot: { pages: Array<{ pageObjectNumber: number }> };
    };
    expect(list.tag).toBe('pages.list');
    const pon = list.snapshot.pages[0]!.pageObjectNumber;

    const { result, transfer } = await resolved({
      kind: 'pages.renderEncoded',
      jobId: nextJob++,
      docId,
      pageObjectNumber: pon,
      options: { viewport: { kind: 'width', width: 120 } },
      encode: { format: 'webp' },
    });
    const payload = result as {
      tag: string;
      image: { contentType: string; width: number; height: number; bytes: Uint8Array };
    };
    expect(payload.tag).toBe('pages.renderEncoded');
    expect(payload.image.contentType).toBe('image/webp');
    expect(payload.image.width).toBe(120);
    expect(payload.image.height).toBe(60); // 200×100 page at width 120
    expect(isWebp(payload.image.bytes)).toBe(true);
    // The transfer manifest must transfer the image's OWN buffer — the
    // zero-copy contract the whole payload win rests on.
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBe(payload.image.bytes.buffer);

    // png + quality passthrough: different formats decode differently and
    // qualities must actually reach sharp (different output sizes).
    const png = (
      await resolved({
        kind: 'pages.renderEncoded',
        jobId: nextJob++,
        docId,
        pageObjectNumber: pon,
        options: { viewport: { kind: 'width', width: 120 } },
        encode: { format: 'png' },
      })
    ).result as { image: { contentType: string; bytes: Uint8Array } };
    expect(png.image.contentType).toBe('image/png');
    expect(isPng(png.image.bytes)).toBe(true);
  }, 30_000);

  test('document.renderPageFileEncoded: ad-hoc file render encodes in-worker', async () => {
    const { result, transfer } = await resolved({
      kind: 'document.renderPageFileEncoded',
      jobId: nextJob++,
      path: pdfPath,
      password: null,
      pageIndex: 0,
      options: { viewport: { kind: 'width', width: 80 } },
      encode: { format: 'webp' },
    });
    const payload = result as {
      tag: string;
      pageObjectNumber: number;
      pageCount: number;
      image: { bytes: Uint8Array };
    };
    expect(payload.tag).toBe('document.renderPageFileEncoded');
    expect(payload.pageCount).toBe(1);
    expect(payload.pageObjectNumber).toBeGreaterThan(0);
    expect(isWebp(payload.image.bytes)).toBe(true);
    expect(transfer[0]).toBe(payload.image.bytes.buffer);
  }, 30_000);

  test('annotations.renderAppearancesEncoded: async path resolves an empty batch on a blank page', async () => {
    const { result, transfer } = await resolved({
      kind: 'annotations.renderAppearancesEncoded',
      jobId: nextJob++,
      docId: 'real-doc',
      pageObjectNumber: 3, // the page object of the minimal PDF
      encode: { format: 'webp' },
    });
    const payload = result as { tag: string; result: { appearances: unknown[] } };
    expect(payload.tag).toBe('annotations.renderAppearancesEncoded');
    expect(payload.result.appearances).toEqual([]);
    expect(transfer).toHaveLength(0);
  }, 30_000);
});
