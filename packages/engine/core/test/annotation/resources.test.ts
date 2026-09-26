import { deflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  assertAnnotationResources,
  resolveAnnotationResources,
} from '../../src/shared';
import { AnnotationDraftSchema, AnnotationPatchSchema } from '../../src/wire';

/** Minimal valid RGBA PNG built from scratch. */
function makePng(width: number, height: number): Uint8Array<ArrayBuffer> {
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

const invalid = (err: unknown) => EngineError.is(err, EngineErrorCode.InvalidArg);

describe('resolveAnnotationResources', () => {
  test('copies each resource into bytes the write owns', async () => {
    const png = makePng(4, 2);
    const wire = await resolveAnnotationResources({ appearance: png });
    expect(new Uint8Array(wire.appearance!)).toEqual(png);
    // A private copy: transferring it to a worker can't detach the caller's buffer.
    expect(wire.appearance!).not.toBe(png.buffer);
  });

  test('takes bare bytes and Blobs', async () => {
    const png = makePng(2, 2);
    const fromBlob = await resolveAnnotationResources({
      appearance: new Blob([png], { type: 'image/png' }),
      file: new Blob([new Uint8Array([1, 2, 3])]),
    });
    expect(new Uint8Array(fromBlob.appearance!)).toEqual(png);
    expect(new Uint8Array(fromBlob.file!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await resolveAnnotationResources(undefined)).toEqual({});
  });

  test('an appearance that is not PNG, JPEG or PDF fails before anything is sent', async () => {
    await expect(
      resolveAnnotationResources({ appearance: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) }),
    ).rejects.toSatisfy(invalid);
  });

  test('any bytes are a file', async () => {
    const wire = await resolveAnnotationResources({ file: new Uint8Array([9, 9, 9]) });
    expect(wire.file!.byteLength).toBe(3);
  });

  test('an unknown role is refused', async () => {
    await expect(resolveAnnotationResources({ source: makePng(1, 1) } as never)).rejects.toSatisfy(
      invalid,
    );
  });
});

describe('assertAnnotationResources', () => {
  const bytes = new ArrayBuffer(1);

  test('a create needs the resources its kind requires', () => {
    expect(() => assertAnnotationResources('stamp', {}, 'create')).toThrow(/appearance/);
    expect(() => assertAnnotationResources('file-attachment', undefined, 'create')).toThrow(/file/);
    expect(() => assertAnnotationResources('stamp', { appearance: bytes }, 'create')).not.toThrow();
  });

  test('an update may leave them out', () => {
    expect(() => assertAnnotationResources('stamp', {}, 'update')).not.toThrow();
    expect(() =>
      assertAnnotationResources('file-attachment', { file: bytes }, 'update'),
    ).not.toThrow();
  });

  test('a resource the kind does not take is refused', () => {
    expect(() => assertAnnotationResources('square', { appearance: bytes }, 'create')).toThrow(
      /square annotation takes no 'appearance'/,
    );
    expect(() => assertAnnotationResources('stamp', { file: bytes }, 'update')).toThrow(/file/);
  });
});

describe('the data carries no bytes', () => {
  test('a stamp and a file attachment validate without them', () => {
    expect(() =>
      AnnotationDraftSchema.parse({ subtype: 'stamp', rect: RECT, name: 'Approved' }),
    ).not.toThrow();
    expect(() =>
      AnnotationDraftSchema.parse({
        subtype: 'file-attachment',
        rect: RECT,
        file: { name: 'report.pdf', mimeType: 'application/pdf', description: null },
      }),
    ).not.toThrow();
  });

  test('bytes or a resource key inside the data are refused', () => {
    expect(() =>
      AnnotationDraftSchema.parse({ subtype: 'stamp', rect: RECT, source: makePng(2, 2) }),
    ).toThrow();
    expect(() =>
      AnnotationPatchSchema.parse({ subtype: 'stamp', source: makePng(2, 2) }),
    ).toThrow();
    // `fit` is data: how the drawing fills the box.
    expect(() => AnnotationPatchSchema.parse({ subtype: 'stamp', fit: 'cover' })).not.toThrow();
    expect(() =>
      AnnotationDraftSchema.parse({
        subtype: 'file-attachment',
        rect: RECT,
        file: { resource: 'r0', name: 'report.pdf' },
      }),
    ).not.toThrow(); // a stray `resource` inside the value is dropped, like a read's `size`
  });
});
