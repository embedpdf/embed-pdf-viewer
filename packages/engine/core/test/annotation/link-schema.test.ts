import { describe, expect, test } from 'vitest';
import type {
  AnnotationDTO,
  LinkDraft,
  LinkPatch,
  PdfCoordinates,
  PdfLinkTarget,
} from '../../src/shared';
import { pdfResolveAnnotationPatch } from '../../src/shared';
import {
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  LinkDraftSchema,
  LinkPatchSchema,
  PdfDestinationSchema,
  PdfLinkTargetSchema,
  PdfLinkTargetWritableSchema,
} from '../../src/wire';

const RECT = { x: 10, y: 20, width: 100, height: 20 };

describe('link kind schemas', () => {
  test('destination arms validate, including spec-null axes', () => {
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'xyz',
        page: { kind: 'objectNumber', objectNumber: 12 },
        left: null,
        top: 640,
        zoom: null,
      }).success,
    ).toBe(true);
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'fit',
        page: { kind: 'objectNumber', objectNumber: 3 },
      }).success,
    ).toBe(true);
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'fitR',
        page: { kind: 'objectNumber', objectNumber: 3 },
        left: 0,
        bottom: 0,
        right: 200,
        top: 300,
      }).success,
    ).toBe(true);
    // fitR without the full rect is malformed.
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'fitR',
        page: { kind: 'objectNumber', objectNumber: 3 },
      }).success,
    ).toBe(false);
  });

  test('the full target union reads goto-remote/launch/unsupported', () => {
    const arms: PdfLinkTarget[] = [
      {
        kind: 'goto',
        destination: { kind: 'fit', page: { kind: 'objectNumber', objectNumber: 5 } },
      },
      { kind: 'uri', uri: 'https://embedpdf.com' },
      { kind: 'goto-remote', file: 'other.pdf' },
      { kind: 'launch', path: 'app.exe' },
      { kind: 'javascript' },
      { kind: 'named', name: 'NextPage' },
      { kind: 'unsupported' },
    ];
    for (const target of arms) {
      expect(PdfLinkTargetSchema.safeParse(target).success).toBe(true);
    }
  });

  test('the WRITABLE union refuses goto-remote, launch, and javascript', () => {
    expect(PdfLinkTargetWritableSchema.safeParse({ kind: 'launch', path: 'app.exe' }).success).toBe(
      false,
    );
    expect(
      PdfLinkTargetWritableSchema.safeParse({ kind: 'goto-remote', file: 'other.pdf' }).success,
    ).toBe(false);
    expect(PdfLinkTargetWritableSchema.safeParse({ kind: 'javascript' }).success).toBe(false);
    expect(
      PdfLinkTargetWritableSchema.safeParse({ kind: 'uri', uri: 'mailto:hi@embedpdf.com' }).success,
    ).toBe(true);
  });

  test('a draft may carry target: null (create-then-edit) and IRT group linkage', () => {
    const draft: LinkDraft = {
      subtype: 'link',
      rect: RECT,
      target: null,
      // A link grouped to another annotation rides the base
      // relationship field — nothing link-specific.
      reply: {
        to: {
          kind: 'objectNumber',
          page: { kind: 'objectNumber', objectNumber: 4 },
          objectNumber: 77,
        },
        type: 'group',
      },
    };
    const parsed = LinkDraftSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    // And it participates in the catalog-level discriminated union.
    expect(AnnotationDraftSchema.safeParse(draft).success).toBe(true);
  });

  test('a draft refuses a non-writable target', () => {
    expect(
      LinkDraftSchema.safeParse({
        subtype: 'link',
        rect: RECT,
        target: { kind: 'launch', path: 'evil.exe' },
      }).success,
    ).toBe(false);
  });

  test('a patch retargets, clears (null), or leaves (undefined) three-state', () => {
    const retarget: LinkPatch = {
      subtype: 'link',
      target: {
        kind: 'goto',
        destination: { kind: 'xyz', page: { kind: 'objectNumber', objectNumber: 9 }, y: 92 },
      },
    };
    const clear: LinkPatch = { subtype: 'link', target: null };
    const leave: LinkPatch = { subtype: 'link', rect: RECT };
    for (const patch of [retarget, clear, leave]) {
      expect(LinkPatchSchema.safeParse(patch).success).toBe(true);
      expect(AnnotationPatchSchema.safeParse(patch).success).toBe(true);
    }
  });

  test('a read-only target sent back unchanged is kept; a changed one is refused', () => {
    // The engine checks a patch in the file's coordinates, after converting it.
    // `GoBack` is another app's own verb: read, and kept as it is.
    const current = {
      subtype: 'link',
      rect: { left: 10, bottom: 80, right: 110, top: 100 },
      target: { kind: 'named', name: 'GoBack' },
    } as unknown as AnnotationDTO<PdfCoordinates>;
    // The patch schema takes what a read returns, so a read DTO passes.
    expect(LinkPatchSchema.safeParse({ target: { kind: 'named', name: 'GoBack' } }).success).toBe(
      true,
    );
    const kept = pdfResolveAnnotationPatch(current, {
      subtype: 'link',
      contents: 'Back',
      target: { name: 'GoBack', kind: 'named' },
    });
    expect(kept).toEqual({ subtype: 'link', contents: 'Back' });
    expect(() =>
      pdfResolveAnnotationPatch(current, {
        subtype: 'link',
        target: { kind: 'named', name: 'Print' },
      }),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg', details: { field: 'target' } }));
    expect(() =>
      pdfResolveAnnotationPatch(current, { subtype: 'link', target: { kind: 'javascript' } }),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg' }));
    // The four standard page-turning verbs are written like any target.
    const next = pdfResolveAnnotationPatch(current, {
      subtype: 'link',
      target: { kind: 'named', name: 'NextPage' },
    });
    expect(next).toEqual({ subtype: 'link', target: { kind: 'named', name: 'NextPage' } });
    // A writable target replaces it.
    const uri = pdfResolveAnnotationPatch(current, {
      subtype: 'link',
      target: { kind: 'uri', uri: 'https://embedpdf.com' },
    });
    expect(uri).toEqual({ subtype: 'link', target: { kind: 'uri', uri: 'https://embedpdf.com' } });
  });
});
