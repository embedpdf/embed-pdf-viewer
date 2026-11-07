import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Engine, PdfSaveMode } from '@embedpdf/engine-core/runtime';
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { editXmp } from '../../services/src/features/metadata/internal/xmp/editXmp';
import {
  xmpEditsForCustomMetadata,
  xmpEditsForMetadata,
} from '../../services/src/features/metadata/internal/xmp/xmpFields';
import { readXmpPacket } from '../../services/src/features/metadata/internal/xmp/xmpPacket';
import { createLocalEngine } from '../src/index';
import { latin1, pdf } from './helpers/miniPdf';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFile(resolve(here, 'fixtures', name)).then((b) => new Uint8Array(b));

const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  pdfx: 'http://ns.adobe.com/pdfx/1.3/',
};

/** An XMP packet around `descriptions`, laid out the way Adobe's toolkit writes one. */
function packet(descriptions: string): string {
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 9.1">\n` +
    `   <rdf:RDF xmlns:rdf="${NS.rdf}">${descriptions}\n` +
    `   </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `${' '.repeat(40)}\n` +
    `<?xpacket end="w"?>`
  );
}

const title = (text: string) =>
  `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${text}</rdf:li></rdf:Alt></dc:title>`;

describe('XMP edits for a metadata update', () => {
  test('adds, rewrites and removes properties, leaving the rest of the packet as written', () => {
    // Acrobat's layout: every schema in one description.
    const before = packet(`
      <rdf:Description rdf:about=""
            xmlns:xmp="${NS.xmp}"
            xmlns:dc="${NS.dc}"
            xmlns:pdf="${NS.pdf}">
         <xmp:CreatorTool>Adobe Acrobat 26.2</xmp:CreatorTool>
         <dc:format>application/pdf</dc:format>
         <pdf:Producer>Adobe Acrobat 26.2</pdf:Producer>
      </rdf:Description>`);
    const edits = xmpEditsForMetadata({ creator: null, producer: null, title: 'NEW' });
    expect(editXmp(before, edits)).toBe(
      packet(`
      <rdf:Description rdf:about=""
            xmlns:xmp="${NS.xmp}"
            xmlns:dc="${NS.dc}"
            xmlns:pdf="${NS.pdf}">
         <dc:format>application/pdf</dc:format>
         ${title('NEW')}
      </rdf:Description>`),
    );
  });

  test('writes each property in the description of its schema', () => {
    // Distiller's layout: one description per schema.
    const before = packet(`
      <rdf:Description rdf:about=""
            xmlns:pdf="${NS.pdf}">
         <pdf:Producer>Acrobat Distiller 10.0.0 (Windows)</pdf:Producer>
      </rdf:Description>
      <rdf:Description rdf:about=""
            xmlns:dc="${NS.dc}">
         <dc:format>application/pdf</dc:format>
         <dc:title>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">1.txt - Notepad</rdf:li>
               <rdf:li xml:lang="de">1.txt - Editor</rdf:li>
            </rdf:Alt>
         </dc:title>
         <dc:creator>
            <rdf:Seq>
               <rdf:li>User</rdf:li>
            </rdf:Seq>
         </dc:creator>
      </rdf:Description>`);
    const edits = xmpEditsForMetadata({
      title: 'Q2',
      author: 'Dana Smith',
      producer: null,
      keywords: 'red, green',
    });
    expect(editXmp(before, edits)).toBe(
      packet(`
      <rdf:Description rdf:about=""
            xmlns:pdf="${NS.pdf}">
         <pdf:Keywords>red, green</pdf:Keywords>
      </rdf:Description>
      <rdf:Description rdf:about=""
            xmlns:dc="${NS.dc}">
         <dc:format>application/pdf</dc:format>
         ${title('Q2')}
         <dc:creator><rdf:Seq><rdf:li>Dana Smith</rdf:li></rdf:Seq></dc:creator>
      </rdf:Description>`),
    );
  });

  test('keeps the short form, matches by namespace, and opens a self-closed description', () => {
    // Older Adobe apps write the XMP namespace as `xap:`.
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:pdf="${NS.pdf}" xmlns:xap="${NS.xmp}" pdf:Producer="Old" xap:CreatorTool="Tool"/>`);
    const edits = xmpEditsForMetadata({ producer: 'say "hi"', creator: null, title: 'T' });
    expect(editXmp(before, edits)).toBe(
      packet(`
      <rdf:Description rdf:about="" xmlns:pdf="${NS.pdf}" xmlns:xap="${NS.xmp}" pdf:Producer="say &quot;hi&quot;" xmlns:dc="${NS.dc}">${title('T')}</rdf:Description>`),
    );
  });

  test('leaves a packet that already reads the values as it is', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}" xmlns:pdf="${NS.pdf}">
         <dc:title>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">A &amp; B</rdf:li>
            </rdf:Alt>
         </dc:title>
         <pdf:Producer><![CDATA[<made>]]></pdf:Producer>
      </rdf:Description>`);
    const edits = xmpEditsForMetadata({ title: 'A & B', producer: '<made>', creator: null });
    expect(editXmp(before, edits)).toBe(before);
  });

  test('a property in several descriptions is written once and removed elsewhere', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}">
         ${title('One')}
      </rdf:Description>
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}">
         ${title('Two')}
      </rdf:Description>`);
    expect(editXmp(before, xmpEditsForMetadata({ title: 'Three' }))).toBe(
      packet(`
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}">
         ${title('Three')}
      </rdf:Description>
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}">
      </rdf:Description>`),
    );
  });

  test('escapes text, and drops characters XML cannot hold', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}">
         <dc:format>application/pdf</dc:format>
      </rdf:Description>`);
    const after = editXmp(before, xmpEditsForMetadata({ title: 'A & B <c>\u0001\r' }));
    expect(after).toContain(title('A &amp; B &lt;c&gt;&#xD;'));
  });

  test('makes a description when the packet has none', () => {
    const before = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${NS.rdf}"></rdf:RDF></x:xmpmeta>`;
    expect(editXmp(before, xmpEditsForMetadata({ title: 'T', creator: null }))).toBe(
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${NS.rdf}">` +
        `<rdf:Description rdf:about="" xmlns:dc="${NS.dc}">${title('T')}</rdf:Description>` +
        `</rdf:RDF></x:xmpmeta>`,
    );
  });

  test('declares a free prefix when the usual one is taken', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:dc="http://example.com/not-dublin-core/">
         <dc:format>x</dc:format>
      </rdf:Description>`);
    expect(editXmp(before, xmpEditsForMetadata({ title: 'T' }))).toBe(
      packet(`
      <rdf:Description rdf:about="" xmlns:dc="http://example.com/not-dublin-core/" xmlns:dc2="${NS.dc}">
         <dc:format>x</dc:format>
         <dc2:title><rdf:Alt><rdf:li xml:lang="x-default">T</rdf:li></rdf:Alt></dc2:title>
      </rdf:Description>`),
    );
  });

  test('keywords, dates and trapping', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:dc="${NS.dc}" xmlns:xmp="${NS.xmp}">
         <dc:subject>
            <rdf:Bag>
               <rdf:li>old</rdf:li>
            </rdf:Bag>
         </dc:subject>
         <xmp:CreateDate>2017-07-12T21:44:10-07:00</xmp:CreateDate>
      </rdf:Description>`);
    const after = editXmp(
      before,
      xmpEditsForMetadata({
        keywords: 'red, green; blue',
        createdAt: '2026-01-04T09:00:00.250+01:00',
        modifiedAt: new Date(Date.UTC(2026, 0, 5, 10, 0, 0, 500)),
        trapped: 'true',
      }),
    );
    expect(after).toContain(
      '<dc:subject><rdf:Bag><rdf:li>red</rdf:li><rdf:li>green</rdf:li><rdf:li>blue</rdf:li></rdf:Bag></dc:subject>',
    );
    // Dates as /Info gets them: whole seconds, the same offset.
    expect(after).toContain('<xmp:CreateDate>2026-01-04T09:00:00+01:00</xmp:CreateDate>');
    expect(after).toContain('<xmp:ModifyDate>2026-01-05T10:00:00Z</xmp:ModifyDate>');
    expect(after).toContain('<pdf:Keywords>red, green; blue</pdf:Keywords>');
    expect(after).toContain('<pdf:Trapped>True</pdf:Trapped>');

    // The keyword list follows keywords only where the packet has one.
    const without = packet(`
      <rdf:Description rdf:about="" xmlns:pdf="${NS.pdf}"/>`);
    expect(editXmp(without, xmpEditsForMetadata({ keywords: 'a, b' }))).not.toContain('dc:subject');
    expect(editXmp(before, xmpEditsForMetadata({ keywords: null }))).not.toContain('dc:subject');
  });

  test('custom keys follow their pdfx: property, which is never added', () => {
    const before = packet(`
      <rdf:Description rdf:about="" xmlns:pdfx="${NS.pdfx}" pdfx:SourceModified="D:2008">
         <pdfx:Company>Fernquill Ltd</pdfx:Company>
      </rdf:Description>`);
    const edits = xmpEditsForCustomMetadata({
      Company: null,
      SourceModified: 'D:2026',
      reviewedBy: 'lee',
      'has space': null,
    });
    expect(edits.map((edit) => edit.property.name)).toEqual([
      'Company',
      'SourceModified',
      'reviewedBy',
    ]);
    expect(editXmp(before, edits)).toBe(
      packet(`
      <rdf:Description rdf:about="" xmlns:pdfx="${NS.pdfx}" pdfx:SourceModified="D:2026">
      </rdf:Description>`),
    );
  });

  test('a packet that is not well-formed, or has no rdf:RDF, is not read', () => {
    const edits = xmpEditsForMetadata({ title: 'T' });
    expect(editXmp('<x:xmpmeta><rdf:RDF', edits)).toBeNull();
    expect(editXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>', edits)).toBeNull();
    expect(
      editXmp(packet(`<rdf:Description rdf:about="">&nbsp;</rdf:Description>`), edits),
    ).toBeNull();
    expect(editXmp(packet(`<rdf:Description></rdf:Descriptio>`), edits)).toBeNull();
  });
});

const TOOL = 'Adobe Acrobat 26.2.21931';

describe.each(['wasm', 'native'] as const)('XMP kept in step, %s runtime', (prefer) => {
  let engine: Engine;
  let runtime: PdfRuntimeModule;
  let opened = 0;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer } });
    runtime = await createPdfRuntime({ prefer });
  });
  afterAll(async () => {
    await engine?.destroy();
  });

  /** The XMP packet a saved file opens with. */
  function xmpOf(bytes: Uint8Array): string | null {
    const { fn, mem } = runtime;
    const buffer = mem.alloc(bytes.length);
    mem.writeBytes(buffer, bytes);
    const doc = fn.FPDF_LoadMemDocument64(buffer, bytes.length, '');
    try {
      expect(doc).toBeTruthy();
      return readXmpPacket(fn, mem, doc)?.text ?? null;
    } finally {
      fn.FPDF_CloseDocument(doc);
      mem.free(buffer);
    }
  }

  async function open(bytes: Uint8Array) {
    return engine.open({ kind: 'bytes', id: `xmp-${prefer}-${++opened}`, bytes }, { scope: ['*'] });
  }

  describe.each(['rewrite', 'incremental'] as PdfSaveMode[])('%s save', (mode) => {
    test('removing the creator and producer removes them from the XMP too', async () => {
      const doc = await open(await fixture('stamp-opacity-acrobat.pdf'));
      expect(xmpOf(await doc.download())).toContain(`<xmp:CreatorTool>${TOOL}</xmp:CreatorTool>`);
      await doc.metadata.update({ creator: null, producer: null, title: 'NEW' });
      const saved = await doc.download({ mode });
      await doc.close();

      const xmp = xmpOf(saved)!;
      expect(xmp).toContain(title('NEW'));
      expect(xmp).not.toContain('CreatorTool');
      expect(xmp).not.toContain('Producer');
      // The rest stays as Acrobat wrote it.
      expect(xmp).toContain(
        '<xmpMM:DocumentID>uuid:38186d3c-b880-ca40-a1ee-d886f550f0f5</xmpMM:DocumentID>',
      );
      expect(xmp).toContain('<?xpacket end="w"?>');
      // A rewrite holds no trace of the old values; an incremental save keeps
      // the old revision, the packet included.
      expect(latin1(saved).includes(TOOL)).toBe(mode === 'incremental');

      const reopened = await open(saved);
      await expect(reopened.metadata.get()).resolves.toMatchObject({
        title: 'NEW',
        creator: null,
        producer: null,
      });
      await reopened.close();
    });

    test('a packet with one description per schema', async () => {
      const doc = await open(await fixture('embedded_attachments.pdf'));
      await doc.metadata.update({ author: 'Dana Smith', title: null, createdAt: null });
      const xmp = xmpOf(await doc.download({ mode }))!;
      await doc.close();
      expect(xmp).toContain(
        '<dc:creator><rdf:Seq><rdf:li>Dana Smith</rdf:li></rdf:Seq></dc:creator>',
      );
      expect(xmp).not.toContain('dc:title');
      expect(xmp).not.toContain('xmp:CreateDate');
      expect(xmp).toContain('<xmp:CreatorTool>PScript5.dll Version 5.2.2</xmp:CreatorTool>');
      expect(xmp).toContain('<pdf:Producer>Acrobat Distiller 10.0.0 (Windows)</pdf:Producer>');
    });
  });

  test('an encrypted packet is read and written through the encryption', async () => {
    const doc = await open(await fixture('uscis-i-140-protected.pdf'));
    const before = xmpOf(await doc.download())!;
    expect(before).toContain('x:xmpmeta');
    await doc.metadata.update({ title: 'NEW' });
    const xmp = xmpOf(await doc.download({ mode: 'rewrite' }))!;
    await doc.close();
    expect(xmp).toContain('NEW</rdf:li>');
  });

  test('a document without XMP gets none', async () => {
    const doc = await open(await fixture('hello_world.pdf'));
    await doc.metadata.update({ title: 'NEW', author: 'Dana' });
    await doc.metadata.custom.update({ reviewedBy: 'lee' });
    const saved = await doc.download({ mode: 'rewrite' });
    await doc.close();
    expect(xmpOf(saved)).toBeNull();
    expect(latin1(saved)).not.toContain('/Metadata');
  });

  test('a UTF-16 packet goes back in UTF-16', async () => {
    const text =
      `﻿<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${NS.rdf}">` +
      `<rdf:Description rdf:about="" xmlns:pdf="${NS.pdf}"><pdf:Producer>Old</pdf:Producer>` +
      `</rdf:Description></rdf:RDF></x:xmpmeta>`;
    const utf16 = latin1(Buffer.from(text, 'utf16le'));
    const input = pdf({
      1: '<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>',
      2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
      4: `<< /Type /Metadata /Subtype /XML /Length ${utf16.length} >>\nstream\n${utf16}\nendstream`,
    });
    const doc = await open(input);
    await doc.metadata.update({ producer: 'Ünïcode' });
    const saved = await doc.download({ mode: 'rewrite' });
    await doc.close();
    expect(xmpOf(saved)).toBe(text.replace('>Old<', '>Ünïcode<'));
    expect(latin1(saved)).toContain(latin1(Buffer.from('<pdf:Producer>Ünïcode', 'utf16le')));
  });

  test('custom keys reach the pdfx: properties Adobe apps copy them to', async () => {
    const xmp =
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="${NS.rdf}">` +
      `<rdf:Description rdf:about="" xmlns:pdfx="${NS.pdfx}">` +
      `<pdfx:Company>Fernquill Ltd</pdfx:Company><pdfx:Project>Atlas</pdfx:Project>` +
      `</rdf:Description></rdf:RDF></x:xmpmeta>`;
    const input = pdf(
      {
        1: '<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>',
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
        4: `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`,
        5: '<< /Company (Fernquill Ltd) /Project (Atlas) >>',
      },
      '/Info 5 0 R',
    );
    const doc = await open(input);
    await doc.metadata.custom.update({ Company: null, Project: 'Beacon', reviewedBy: 'lee' });
    const saved = await doc.download({ mode: 'rewrite' });
    await doc.close();
    expect(xmpOf(saved)).toBe(
      xmp.replace('<pdfx:Company>Fernquill Ltd</pdfx:Company>', '').replace('Atlas', 'Beacon'),
    );
    expect(latin1(saved)).not.toContain('Fernquill');
  });

  test('an undo puts the XMP back with the metadata', async () => {
    const doc = await open(await fixture('embedded_attachments.pdf'));
    const { meta } = await doc.metadata.update({ title: 'Changed', author: null });
    expect(xmpOf(await doc.download())).toContain(title('Changed'));
    await doc.apply({ undoOf: meta.opId });
    const xmp = xmpOf(await doc.download({ mode: 'rewrite' }))!;
    await doc.close();
    expect(xmp).toContain(title('1.txt - Notepad'));
    expect(xmp).toContain('<dc:creator><rdf:Seq><rdf:li>User</rdf:li></rdf:Seq></dc:creator>');
  });
});
