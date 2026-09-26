import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { toBase64 } from '../../src/resource/base64';
import {
  resourceIdOf,
  type AnnotationBundle,
  type ResourceId,
} from '../../src/transfer/AnnotationBundle';
import { AnnotationTransfer } from '../../src/transfer/AnnotationTransfer';
import {
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  type AnnotationBundleLimits,
} from '../../src/transfer/bundleLimits';

const page = { kind: 'objectNumber', pageObjectNumber: 3 } as const;
const drawing = new TextEncoder().encode('%PDF-1.7 a drawing');
const file = new TextEncoder().encode('an attached file');

/** A read's data, as far as the file cares: the file never interprets it. */
const stamp = (annotObjectNumber: number) =>
  ({
    subtype: 'stamp',
    ref: { kind: 'objectNumber', page, annotObjectNumber },
    rect: { left: 10, bottom: 10, right: 110, top: 60 },
    contents: 'Apprové ✓',
  }) as unknown as AnnotationDTO;

/** Two stamps sharing one drawing and an attachment with its file. */
async function sample(): Promise<AnnotationBundle> {
  const drawingId = await resourceIdOf(drawing);
  const fileId = await resourceIdOf(file);
  return {
    format: 'embedpdf/annotations',
    version: 1,
    pages: [{ page, position: 0, box: { left: 0, bottom: 0, right: 612, top: 792 } }],
    items: [
      { data: stamp(12), resources: { appearance: drawingId } },
      { data: stamp(13), resources: { appearance: drawingId } },
      {
        data: {
          subtype: 'file-attachment',
          ref: { kind: 'objectNumber', page, annotObjectNumber: 14 },
        } as unknown as AnnotationDTO,
        resources: { file: fileId },
      },
    ],
    resources: { [drawingId]: drawing, [fileId]: file },
  };
}

/** The file for `bundle` with `change` applied to its JSON, skipping stringify's checks. */
function edited(bundle: AnnotationBundle, change: (json: Record<string, unknown>) => void): string {
  const json = JSON.parse(AnnotationTransfer.stringify(bundle)) as Record<string, unknown>;
  change(json);
  return JSON.stringify(json);
}

const limitsWith = (overrides: Partial<AnnotationBundleLimits>): AnnotationBundleLimits => ({
  ...DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  ...overrides,
});

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).not.toBeNull();
  return error as { code: string; message: string; details?: Record<string, unknown> };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a bundle through the file', () => {
  test('comes back as the same bundle', async () => {
    const bundle = await sample();
    const parsed = await AnnotationTransfer.parse(AnnotationTransfer.stringify(bundle));
    expect(parsed).toEqual(bundle);
  });

  test('holds a resource once however many items name it', async () => {
    const json = JSON.parse(AnnotationTransfer.stringify(await sample())) as {
      resources: Record<string, string>;
    };
    expect(Object.keys(json.resources)).toHaveLength(2);
  });

  test('names each resource by the SHA-256 of its bytes', async () => {
    expect(await resourceIdOf(new TextEncoder().encode('abc'))).toBe(
      'sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('parse refuses a file that is not a bundle', () => {
  test.each([
    ['text that is not JSON', 'not json', /not an annotation bundle/],
    ['JSON without resources', '{"format":"embedpdf/annotations"}', /not an annotation bundle/],
  ])('%s', async (_name, text, message) => {
    const error = await refusal(AnnotationTransfer.parse(text));
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toMatch(message);
  });

  test('an unknown format or version', async () => {
    const bundle = await sample();
    for (const [field, value] of [
      ['format', 'embedpdf/other'],
      ['version', 2],
    ] as const) {
      const error = await refusal(
        AnnotationTransfer.parse(edited(bundle, (json) => (json[field] = value))),
      );
      expect(error.code).toBe(EngineErrorCode.InvalidArg);
      expect(error.message).toContain(`unknown ${field}`);
    }
  });

  test('a field the format does not have, naming it', async () => {
    const bundle = await sample();
    const error = await refusal(
      AnnotationTransfer.parse(edited(bundle, (json) => (json.comment = 'hello'))),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain("unknown field 'comment'");
  });

  test('an item on a page the bundle does not list', async () => {
    const bundle = await sample();
    const error = await refusal(
      AnnotationTransfer.parse(
        edited(bundle, (json) => {
          (json.pages as Array<{ page: { pageObjectNumber: number } }>)[0]!.page.pageObjectNumber =
            4;
        }),
      ),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain("page the bundle doesn't list");
  });
});

describe('parse checks resources against items and ids', () => {
  test('refuses a resource whose bytes do not match its id', async () => {
    const bundle = await sample();
    const [drawingId] = Object.keys(bundle.resources) as ResourceId[];
    const tampered = new Uint8Array(drawing);
    tampered[0] ^= 1;
    const error = await refusal(
      AnnotationTransfer.parse(
        edited(bundle, (json) => {
          (json.resources as Record<string, string>)[drawingId!] = toBase64(tampered);
        }),
      ),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain("doesn't match its id");
  });

  test('refuses an item naming a resource the bundle does not hold', async () => {
    const bundle = await sample();
    const [drawingId] = Object.keys(bundle.resources) as ResourceId[];
    const error = await refusal(
      AnnotationTransfer.parse(
        edited(bundle, (json) => {
          delete (json.resources as Record<string, string>)[drawingId!];
        }),
      ),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain("which the bundle doesn't hold");
  });

  test('refuses a resource no item names', async () => {
    const bundle = await sample();
    const extra = new TextEncoder().encode('unused');
    const extraId = await resourceIdOf(extra);
    const error = await refusal(
      AnnotationTransfer.parse(
        edited(bundle, (json) => {
          (json.resources as Record<string, string>)[extraId] = toBase64(extra);
        }),
      ),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain('is named by no item');
  });

  test('refuses a resource that is not base64', async () => {
    const bundle = await sample();
    const [drawingId] = Object.keys(bundle.resources) as ResourceId[];
    const error = await refusal(
      AnnotationTransfer.parse(
        edited(bundle, (json) => {
          (json.resources as Record<string, string>)[drawingId!] = 'not!base64';
        }),
      ),
    );
    expect(error.code).toBe(EngineErrorCode.InvalidArg);
    expect(error.message).toContain('is not base64');
  });
});

describe('parse applies the limits before it decodes anything', () => {
  test('refuses text longer than any bundle within the limit, before reading it as JSON', async () => {
    const limits = limitsWith({ bundleBytes: 1_000, resources: 1 });
    const parseJson = vi.spyOn(JSON, 'parse');
    const error = await refusal(AnnotationTransfer.parse('x'.repeat(2_000), { limits }));
    expect(error.code).toBe(EngineErrorCode.PayloadTooLarge);
    expect(error.details?.limit).toBe('bundleBytes');
    expect(parseJson).not.toHaveBeenCalled();
  });

  test.each([
    ['items', { items: 2 }],
    ['pages', { pages: 0 }],
    ['resources', { resources: 1 }],
    ['resourceBytes', { resourceBytes: drawing.length - 1 }],
    ['manifestBytes', { manifestBytes: 100 }],
    ['bundleBytes', { bundleBytes: 600 }],
  ] as const)(
    'refuses past its %s limit, decoding and hashing nothing',
    async (limit, overrides) => {
      const text = AnnotationTransfer.stringify(await sample());
      const digest = vi.spyOn(crypto.subtle, 'digest');
      const error = await refusal(
        AnnotationTransfer.parse(text, { limits: limitsWith(overrides) }),
      );
      expect(error.code).toBe(EngineErrorCode.PayloadTooLarge);
      expect(error.details).toMatchObject({
        limit,
        max: overrides[limit as keyof typeof overrides],
      });
      expect(digest).not.toHaveBeenCalled();
    },
  );

  test('accepts a bundle exactly at its limits', async () => {
    const bundle = await sample();
    const text = AnnotationTransfer.stringify(bundle);
    const limits = limitsWith({ items: 3, pages: 1, resources: 2, resourceBytes: drawing.length });
    await expect(AnnotationTransfer.parse(text, { limits })).resolves.toEqual(bundle);
  });
});

describe('stringify writes no file parse would refuse for its shape or size', () => {
  test('refuses a bundle past a limit', async () => {
    const bundle = await sample();
    expect(() =>
      AnnotationTransfer.stringify(bundle, { limits: limitsWith({ items: 1 }) }),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.PayloadTooLarge }));
  });

  test('refuses an item naming a resource the bundle does not hold', async () => {
    const bundle = await sample();
    const missing = { ...bundle, resources: {} };
    expect(() => AnnotationTransfer.stringify(missing)).toThrow(/which the bundle doesn't hold/);
  });
});
