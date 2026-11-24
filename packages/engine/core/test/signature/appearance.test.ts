import { describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  resolveChangeResources,
  resolveSignatureAppearance,
  signatureAppearanceBytes,
} from '../../src/shared';
import { BANDS_JPEG, BANDS_PDF, BANDS_PNG } from '../../src/conformance';
import {
  ChangeOpWireSchema,
  MARK_IMAGE_OR_NONE_SINCE,
  SignatureAppearanceBodySchema,
  SignaturePrepareBodySchema,
  lacksWhatArrivedIn,
} from '../../src/wire';

const invalid = (error: unknown) => EngineError.is(error, EngineErrorCode.InvalidArg);
const field = { kind: 'fqn', name: 'sig' } as const;

describe("a signature's mark as a caller passes it", () => {
  test('bytes and a Blob resolve to a copy the write owns, as bytes', async () => {
    for (const bytes of [BANDS_PNG, BANDS_JPEG, BANDS_PDF]) {
      const copy = await resolveSignatureAppearance(bytes);
      expect(copy).toBeInstanceOf(Uint8Array);
      expect(copy).toEqual(bytes);
      // A copy: a transfer of it leaves the caller's bytes as they are.
      expect(copy).not.toBe(bytes);
      expect(signatureAppearanceBytes(copy)).toEqual({ bytes, declaredPdf: false });
    }
    const fromBlob = await resolveSignatureAppearance(new Blob([BANDS_PNG.slice()]));
    expect(fromBlob).toEqual(BANDS_PNG);
  });

  test('`{ pdf }` keeps its spelling: a copy under the same key, read as a PDF only', async () => {
    const keyed = await resolveSignatureAppearance({ pdf: BANDS_PDF });
    expect(keyed).toEqual({ pdf: BANDS_PDF });
    expect((keyed as { pdf: Uint8Array }).pdf).not.toBe(BANDS_PDF);
    expect(signatureAppearanceBytes(keyed)).toEqual({ bytes: BANDS_PDF, declaredPdf: true });
    // An image under `{ pdf }` stays under it, and is refused where it is drawn.
    const image = await resolveSignatureAppearance({ pdf: BANDS_PNG });
    expect(signatureAppearanceBytes(image)).toEqual({ bytes: BANDS_PNG, declaredPdf: true });
  });

  test('no mark stays no mark', async () => {
    expect(await resolveSignatureAppearance(null)).toBeNull();
    expect(signatureAppearanceBytes(null)).toBeNull();
  });

  test('bytes that are no PNG, JPEG or PDF are refused as a stamp refuses them', async () => {
    const unknown = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
    await expect(resolveSignatureAppearance(unknown)).rejects.toSatisfy(invalid);
    await expect(resolveSignatureAppearance(unknown)).rejects.toMatchObject({
      message: 'the appearance resource must be PNG, JPEG or one-page PDF bytes',
    });
    await expect(resolveSignatureAppearance(new Blob([unknown]))).rejects.toSatisfy(invalid);
    // `{ pdf }` names its format: the bytes travel unchecked, and are judged where they are drawn.
    expect(await resolveSignatureAppearance({ pdf: unknown })).toEqual({ pdf: unknown });
  });

  test('a write refuses a Blob that was never read', () => {
    expect(() => signatureAppearanceBytes(new Blob([BANDS_PNG.slice()]))).toThrow(
      /never as a Blob/,
    );
  });

  test('a change resolves its marks in their spelling, and lists each copy for the transfer', async () => {
    const resolved = await resolveChangeResources({
      ops: [
        { type: 'forms.setSignatureAppearance', field, appearance: new Blob([BANDS_PNG.slice()]) },
        { type: 'forms.setSignatureAppearance', field, appearance: { pdf: BANDS_PDF } },
        { type: 'forms.setSignatureAppearance', field, appearance: null },
      ],
    });
    if (!('ops' in resolved.change)) throw new Error('expected ops');
    const marks = resolved.change.ops.map((op) =>
      op.type === 'forms.setSignatureAppearance' ? signatureAppearanceBytes(op.appearance) : null,
    );
    expect(marks).toEqual([
      { bytes: BANDS_PNG, declaredPdf: false },
      { bytes: BANDS_PDF, declaredPdf: true },
      null,
    ]);
    expect(resolved.buffers).toEqual([marks[0]!.bytes.buffer, marks[1]!.bytes.buffer]);
  });
});

describe("a signature's mark on the wire", () => {
  const op = (resources: unknown) => ({ type: 'forms.setSignatureAppearance', field, resources });

  test('the op and the visual fill name the part, or `null` for no mark', () => {
    expect(ChangeOpWireSchema.safeParse(op({ appearance: 'r0' })).success).toBe(true);
    expect(ChangeOpWireSchema.safeParse(op({ appearance: null })).success).toBe(true);
    for (const appearance of ['appearance', null]) {
      expect(SignatureAppearanceBodySchema.safeParse({ resources: { appearance } }).success).toBe(
        true,
      );
    }
  });

  test('they say which: a missing key, an empty key and another role are refused', () => {
    for (const resources of [undefined, {}, { appearance: '' }, { appearance: 'r0', file: 'r1' }]) {
      expect(ChangeOpWireSchema.safeParse(op(resources)).success).toBe(false);
    }
    expect(SignatureAppearanceBodySchema.safeParse({}).success).toBe(false);
  });

  test('a prepare names its part or leaves `resources` out: it has no `null`', () => {
    expect(SignaturePrepareBodySchema.safeParse({ field }).success).toBe(true);
    expect(
      SignaturePrepareBodySchema.safeParse({ field, resources: { appearance: 'appearance' } })
        .success,
    ).toBe(true);
    expect(
      SignaturePrepareBodySchema.safeParse({ field, resources: { appearance: null } }).success,
    ).toBe(false);
  });

  test('an image and no mark arrived in 3.4: a side of 3.2 lacks them', () => {
    expect(MARK_IMAGE_OR_NONE_SINCE).toBe('3.4');
    expect(lacksWhatArrivedIn('3.2', MARK_IMAGE_OR_NONE_SINCE)).toBe(true);
    // A side that didn't say its version reads as this build's own.
    expect(lacksWhatArrivedIn(null, MARK_IMAGE_OR_NONE_SINCE)).toBe(false);
  });
});
