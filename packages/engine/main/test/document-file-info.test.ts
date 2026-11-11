import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { DocumentHandle, Engine } from '@embedpdf/engine-core/public';
import { createLocalEngine } from '../src/index';

/** A PDF built from `objects` (object n = objects[n - 1]), with a classic xref table. */
function buildPdf(objects: string[], trailer: string, header = '%PDF-1.6'): Uint8Array {
  let body = `${header}\n%âãÏÓ\n`;
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(body, (c) => c.charCodeAt(0));
}

const XMP =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta><?xpacket end="w"?>';

const withEverything = buildPdf(
  [
    `<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /PageMode /UseOutlines /Lang (he-IL) /Names << /Dests 9 0 R >> /Dests 10 0 R /Metadata 11 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>`,
    `<< /Type /Outlines /First 6 0 R /Last 8 0 R /Count 3 >>`,
    // A string name from the name tree, an explicit destination, a GoTo naming an old-style /Dests key.
    `<< /Title (Named) /Parent 5 0 R /Next 7 0 R /Dest (chapter-2) >>`,
    `<< /Title (Explicit) /Parent 5 0 R /Prev 6 0 R /Next 8 0 R /Dest [4 0 R /XYZ 10 700 null] >>`,
    `<< /Title (Action) /Parent 5 0 R /Prev 7 0 R /A << /S /GoTo /D /intro >> >>`,
    `<< /Names [(chapter-2) [4 0 R /XYZ 20 600 0]] >>`,
    `<< /intro [3 0 R /Fit] >>`,
    `<< /Type /Metadata /Subtype /XML /Length ${XMP.length} >>\nstream\n${XMP}\nendstream`,
    `<< /Title (A title) /CreationDate (D:20240102030405+02'00') /Trapped /True /Custom (x) >>`,
  ],
  `/Root 1 0 R /Info 12 0 R /ID [<00112233445566778899AABBCCDDEEFF> <FFEEDDCCBBAA99887766554433221100>]`,
);

const bare = buildPdf(
  [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>`,
  ],
  `/Root 1 0 R`,
  '%PDF-1.4',
);

let engine: Engine;
let opened = 0;
const open = (bytes: Uint8Array): Promise<DocumentHandle> =>
  engine.open({ kind: 'bytes', id: `file-info-${opened++}`, bytes }, { scope: ['*'] }) as never;

beforeAll(async () => {
  engine = (await createLocalEngine({ runtime: { prefer: 'wasm' } })) as unknown as Engine;
});
afterAll(async () => {
  await engine.destroy();
});

describe('doc.metadata.file()', () => {
  test('reads the header, trailer and catalog facts', async () => {
    const doc = await open(withEverything);
    try {
      const file = await doc.metadata.file();
      expect(file.version).toBe('1.6');
      expect(file.identifiers).toEqual({
        permanent: '00112233445566778899aabbccddeeff',
        changing: 'ffeeddccbbaa99887766554433221100',
      });
      expect(file.language).toBe('he-IL');
      expect(file.pageMode).toBe('outlines');
      expect(file.xmp).toBe(XMP);
      expect(file.info).toEqual({
        Title: 'A title',
        CreationDate: "D:20240102030405+02'00'",
        Trapped: 'True',
        Custom: 'x',
      });
    } finally {
      await doc.close();
    }
  });

  test('reads the defaults of a file that sets none of them', async () => {
    const doc = await open(bare);
    try {
      expect(await doc.metadata.file()).toEqual({
        version: '1.4',
        identifiers: null,
        language: null,
        pageMode: 'none',
        xmp: null,
        info: {},
      });
    } finally {
      await doc.close();
    }
  });
});

describe('named destinations', () => {
  test('an outline item keeps the name its destination goes by', async () => {
    const doc = await open(withEverything);
    try {
      const { items } = await doc.outline.get();
      expect(items.map((i) => [i.title, i.destinationName])).toEqual([
        ['Named', 'chapter-2'],
        ['Explicit', null],
        ['Action', 'intro'],
      ]);
      const pages = (await doc.pages.list()).pages;
      expect(items[0]!.target).toEqual({
        kind: 'goto',
        destination: { kind: 'xyz', page: pages[1]!.ref, x: 20, y: 200, zoom: null },
      });
    } finally {
      await doc.close();
    }
  });

  test('resolveNamedDestination resolves the name tree and the /Dests dictionary', async () => {
    const doc = await open(withEverything);
    try {
      const pages = (await doc.pages.list()).pages;
      expect(await doc.actions.resolveNamedDestination('chapter-2')).toEqual({
        kind: 'xyz',
        page: pages[1]!.ref,
        x: 20,
        y: 200,
        zoom: null,
      });
      expect(await doc.actions.resolveNamedDestination('intro')).toEqual({
        kind: 'fit',
        page: pages[0]!.ref,
      });
      expect(await doc.actions.resolveNamedDestination('missing')).toBeNull();
    } finally {
      await doc.close();
    }
  });

  test('an item written with a target has no name', async () => {
    const doc = await open(withEverything);
    try {
      const { items } = await doc.outline.get();
      const pages = (await doc.pages.list()).pages;
      const result = await doc.outline.update(items[0]!.ref, {
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[0]!.ref } },
      });
      expect(result.item.destinationName).toBeNull();
      expect((await doc.outline.get()).items[0]!.destinationName).toBeNull();
    } finally {
      await doc.close();
    }
  });
});
