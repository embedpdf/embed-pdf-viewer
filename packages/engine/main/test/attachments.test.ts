import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeflate } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runAttachmentConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import {
  ATTACHMENT_LIMITS,
  EngineErrorCode,
  toAttachmentRef,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
// PDFium's attachment corpus fixture: two embedded files —
// "1.txt" ("test", text/plain) and "attached.pdf" (5869 bytes).
const fixturePath = resolve(here, 'fixtures', 'embedded_attachments.pdf');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runAttachmentConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  openKind: 'bytes',
  fixture: {
    id: 'embedded-attachments-pdf',
    bytes: async () => new Uint8Array(await readFile(fixturePath)),
    expected: {},
  },
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
});

/** `length` zero bytes, deflated: a few hundred kilobytes for the limit. */
async function deflatedZeros(length: number): Promise<Uint8Array> {
  const deflate = createDeflate();
  const chunks: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = once(deflate, 'end');
  const block = Buffer.alloc(1 << 20);
  for (let left = length; left > 0; left -= block.length) {
    if (!deflate.write(left >= block.length ? block : block.subarray(0, left))) {
      await once(deflate, 'drain');
    }
  }
  deflate.end();
  await ended;
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * One page whose file-attachment annotation (6) holds the document's one
 * embedded file, `big.bin` (4), which says it has 3 bytes and decodes to
 * `stream`'s.
 */
function pdfWithFile(stream: Uint8Array): Uint8Array {
  const objects: (string | Uint8Array)[][] = [
    [
      '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(big.bin) 4 0 R] >> >> >>',
    ],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [6 0 R] >>'],
    ['<< /Type /Filespec /F (big.bin) /UF (big.bin) /EF << /F 5 0 R >> >>'],
    [
      `<< /Type /EmbeddedFile /Filter /FlateDecode /Length ${stream.byteLength} ` +
        '/Params << /Size 3 >> >>\nstream\n',
      stream,
      '\nendstream',
    ],
    ['<< /Type /Annot /Subtype /FileAttachment /Rect [20 20 40 40] /FS 4 0 R /P 3 0 R >>'],
  ];
  const parts: Uint8Array[] = [];
  let length = 0;
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? new TextEncoder().encode(part) : part;
    parts.push(bytes);
    length += bytes.byteLength;
  };
  add('%PDF-1.7\n');
  const offsets = objects.map((object, index) => {
    const at = length;
    add(`${index + 1} 0 obj\n`);
    object.forEach(add);
    add('\nendobj\n');
    return at;
  });
  const start = length;
  add(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) add(`${String(offset).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    pdf.set(part, at);
    at += part.byteLength;
  }
  return pdf;
}

describe('attachment downloads on the local engine', () => {
  test('a file that decodes past the limit is refused at both homes, naming the limit', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const bytes = pdfWithFile(await deflatedZeros(ATTACHMENT_LIMITS.decodedBytes + 1));
      const doc = await engine.open(
        { kind: 'bytes', id: 'attachment-over-the-limit', bytes },
        { scope: ['*'] },
      );
      const refused = {
        code: EngineErrorCode.PayloadTooLarge,
        details: { limit: ATTACHMENT_LIMITS.decodedBytes },
      };
      await expect(doc.attachments.download(toAttachmentRef('big.bin'))).rejects.toMatchObject(
        refused,
      );
      const page = doc.page(toPageRef(3));
      const [annotation] = (await page.annotations.list()).annotations;
      await expect(
        page.annotations.downloadResource(annotation!.ref, 'file'),
      ).rejects.toMatchObject(refused);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  }, 60_000);
});
