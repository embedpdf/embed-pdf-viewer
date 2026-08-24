import { deflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  normalizeAnnotationDraft,
  normalizeAnnotationPatch,
  sniffBinaryMetadata,
  type FileAttachmentDraft,
  type FileAttachmentWireDraft,
  type InkDraft,
  type StampDraft,
  type StampPatch,
  type StampWireDraft,
} from '../../src/shared';
import { AnnotationDraftSchema } from '../../src/wire';

/** Minimal valid RGBA PNG built from scratch. */
function makePng(width: number, height: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(
      [...type].map((ch) => ch.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++)
    raw.fill(255, y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4));
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

const RECT = { left: 10, bottom: 10, right: 110, top: 60 };

describe('normalizeAnnotationDraft', () => {
  test('stamp: inline Uint8Array source → wire ref + sniffed resource', async () => {
    const png = makePng(4, 2);
    const draft: StampDraft = { subtype: 'stamp', rect: RECT, source: png, fit: 'contain' };

    const { wire, resources } = await normalizeAnnotationDraft(draft);

    expect(wire).toEqual({
      subtype: 'stamp',
      rect: RECT,
      fit: 'contain',
      source: { resource: 'r0' },
    });
    const resource = resources['r0']!;
    expect(resource.mimeType).toBe('image/png'); // sniffed, not declared
    expect(new Uint8Array(resource.bytes)).toEqual(png);
    // The wire form passes the single shared Zod schema.
    expect(() => AnnotationDraftSchema.parse(wire)).not.toThrow();
  });

  test('stamp: Blob source resolves; BinaryPayload name/mime survive (mime still re-sniffed)', async () => {
    const png = makePng(2, 2);
    const blobDraft: StampDraft = {
      subtype: 'stamp',
      rect: RECT,
      source: new Blob([png], { type: 'image/png' }),
    };
    const blobResult = await normalizeAnnotationDraft(blobDraft);
    expect(blobResult.resources['r0']!.mimeType).toBe('image/png');

    const payloadDraft: StampDraft = {
      subtype: 'stamp',
      rect: RECT,
      source: { data: png, mimeType: 'image/jpeg', name: 'logo.png' }, // wrong declared mime
    };
    const payloadResult = await normalizeAnnotationDraft(payloadDraft);
    expect(payloadResult.resources['r0']!.mimeType).toBe('image/png'); // sniff wins
    expect(payloadResult.resources['r0']!.name).toBe('logo.png');
  });

  test('stamp: unsupported bytes reject with InvalidArg before any transport', async () => {
    const draft: StampDraft = {
      subtype: 'stamp',
      rect: RECT,
      source: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]),
    };
    await expect(normalizeAnnotationDraft(draft)).rejects.toSatisfy((err: unknown) =>
      EngineError.is(err, EngineErrorCode.InvalidArg),
    );
  });

  test('non-binary kinds pass through untouched with an empty resource map', async () => {
    const draft: InkDraft = {
      subtype: 'ink',
      rect: RECT,
      inkList: [[{ x: 1, y: 1 }]],
    } as InkDraft;
    const { wire, resources } = await normalizeAnnotationDraft(draft);
    expect(wire).toBe(draft); // identity, no clone
    expect(resources).toEqual({});
  });

  test('wire schema rejects inline bytes (only { resource } refs are wire-legal)', () => {
    const inlineAsWire = {
      subtype: 'stamp',
      rect: RECT,
      source: makePng(2, 2),
    };
    expect(() => AnnotationDraftSchema.parse(inlineAsWire)).toThrow();
  });
});

describe('normalizeAnnotationPatch', () => {
  test('stamp patch without source passes through with no resources', async () => {
    const patch: StampPatch = { subtype: 'stamp', rect: RECT };
    const { wire, resources } = await normalizeAnnotationPatch(patch);
    expect(wire).toEqual({ subtype: 'stamp', rect: RECT });
    expect(resources).toEqual({});
  });

  test('stamp patch with source is split like a draft', async () => {
    const png = makePng(2, 2);
    const patch: StampPatch = { subtype: 'stamp', source: png, fit: 'cover' };
    const { wire, resources } = await normalizeAnnotationPatch(patch);
    expect((wire as StampWireDraft).source).toEqual({ resource: 'r0' });
    expect(sniffBinaryMetadata(resources['r0']!.bytes)?.mimeType).toBe('image/png');
  });
});

describe('normalizeAnnotationDraft: file-attachment', () => {
  const rect = { left: 40, bottom: 40, right: 60, top: 60 };
  const data = new Uint8Array([1, 2, 3, 4, 5]);

  test('splits the file into wire metadata + one resource, validated by the wire schema', async () => {
    const draft: FileAttachmentDraft = {
      subtype: 'file-attachment',
      rect,
      file: { data, name: 'report.docx', mimeType: 'application/msword', description: 'Q3' },
      icon: 'paperclip',
    };
    const { wire, resources } = await normalizeAnnotationDraft(draft);
    expect(wire).toEqual({
      subtype: 'file-attachment',
      rect,
      file: {
        resource: 'r0',
        name: 'report.docx',
        mimeType: 'application/msword',
        description: 'Q3',
      },
      icon: 'paperclip',
    });
    expect(Object.keys(resources)).toEqual(['r0']);
    expect(new Uint8Array(resources.r0.bytes)).toEqual(data);
    expect(resources.r0.name).toBe('report.docx');
    // The single Zod schema accepts the post-normalization form.
    expect(AnnotationDraftSchema.parse(wire)).toEqual(wire);
  });

  test('declared mime type is optional and NOT sniffed — any bytes are a valid attachment', async () => {
    const draft: FileAttachmentDraft = {
      subtype: 'file-attachment',
      rect,
      file: { data, name: 'blob.bin' },
    };
    const { wire } = await normalizeAnnotationDraft(draft);
    expect((wire as FileAttachmentWireDraft).file).toEqual({ resource: 'r0', name: 'blob.bin' });
  });

  test('a name is required: from file.name or a File, else InvalidArg', async () => {
    const nameless: FileAttachmentDraft = {
      subtype: 'file-attachment',
      rect,
      file: { data },
    };
    await expect(normalizeAnnotationDraft(nameless)).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
    });

    // A browser File carries its own name (also available in Node >= 20).
    const fromFile: FileAttachmentDraft = {
      subtype: 'file-attachment',
      rect,
      file: { data: new File([data], 'picked.pdf', { type: 'application/pdf' }) },
    };
    const { wire } = await normalizeAnnotationDraft(fromFile);
    expect((wire as FileAttachmentWireDraft).file).toEqual({
      resource: 'r0',
      name: 'picked.pdf',
      mimeType: 'application/pdf',
    });
  });
});
