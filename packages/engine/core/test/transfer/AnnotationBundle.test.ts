import { describe, expect, test } from 'vitest';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import {
  assertAnnotationBundle,
  resourceIdOf,
  type AnnotationBundle,
} from '../../src/transfer/AnnotationBundle';

const page = { kind: 'objectNumber', pageObjectNumber: 3 } as const;
const box = { left: 0, bottom: 0, right: 612, top: 792 };
const drawing = new TextEncoder().encode('%PDF-1.7 a drawing');

async function bundleWith(
  change: (bundle: Record<string, unknown>) => void = () => {},
): Promise<AnnotationBundle> {
  const id = await resourceIdOf(drawing);
  const bundle: Record<string, unknown> = {
    format: 'embedpdf/annotations',
    version: 1,
    pages: [{ page, position: 0, box }],
    items: [
      {
        data: {
          subtype: 'stamp',
          ref: { kind: 'objectNumber', page, annotObjectNumber: 12 },
        } as unknown as AnnotationDTO,
        resources: { appearance: id },
      },
    ],
    resources: { [id]: drawing },
  };
  change(bundle);
  return bundle as unknown as AnnotationBundle;
}

async function refusalOf(bundle: AnnotationBundle) {
  return assertAnnotationBundle(bundle).then(
    () => null,
    (error: { code: string; message: string }) => error,
  );
}

describe('assertAnnotationBundle', () => {
  test('accepts a bundle whose resources match their ids', async () => {
    await expect(assertAnnotationBundle(await bundleWith())).resolves.toBeUndefined();
  });

  test.each([
    [
      'a resource whose bytes do not match its id',
      (bundle: Record<string, unknown>) => {
        const [id] = Object.keys(bundle.resources as object);
        (bundle.resources as Record<string, Uint8Array>)[id!] = new TextEncoder().encode('other');
      },
      "doesn't match its id",
    ],
    [
      'a resource that is not bytes',
      (bundle: Record<string, unknown>) => {
        const [id] = Object.keys(bundle.resources as object);
        (bundle.resources as Record<string, unknown>)[id!] = 'bytes';
      },
      'is not bytes',
    ],
    [
      'a page listed twice',
      (bundle: Record<string, unknown>) => {
        bundle.pages = [
          { page, position: 0, box },
          { page, position: 1, box },
        ];
      },
      'listed twice',
    ],
    [
      'two pages at one position',
      (bundle: Record<string, unknown>) => {
        bundle.pages = [
          { page, position: 0, box },
          { page: { kind: 'objectNumber', pageObjectNumber: 4 }, position: 0, box },
        ];
      },
      'position 0 is listed twice',
    ],
    [
      'a resource role no kind takes',
      (bundle: Record<string, unknown>) => {
        const [item] = bundle.items as Array<{ resources: Record<string, string> }>;
        item!.resources = { thumbnail: item!.resources.appearance! };
      },
      "unknown resource role 'thumbnail'",
    ],
    [
      'an unknown field on an item, naming it',
      (bundle: Record<string, unknown>) => {
        (bundle.items as Array<Record<string, unknown>>)[0]!.note = 'x';
      },
      "unknown field 'note'",
    ],
  ])('refuses %s', async (_name, change, message) => {
    const error = await refusalOf(await bundleWith(change));
    expect(error?.code).toBe(EngineErrorCode.InvalidArg);
    expect(error?.message).toContain(message);
  });
});
