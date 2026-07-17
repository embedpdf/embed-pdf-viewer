import { describe, expect, test } from 'vitest';
import type { LinkDraft, LinkPatch, PdfLinkTarget } from '../../src/shared';
import {
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  LinkDraftSchema,
  LinkPatchSchema,
  PdfDestinationSchema,
  PdfLinkTargetSchema,
  PdfLinkTargetWritableSchema,
} from '../../src/wire';

const RECT = { left: 10, top: 100, right: 110, bottom: 80 };

describe('link kind schemas', () => {
  test('destination arms validate, including spec-null axes', () => {
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'xyz',
        pageObjectNumber: 12,
        left: null,
        top: 640,
        zoom: null,
      }).success,
    ).toBe(true);
    expect(PdfDestinationSchema.safeParse({ kind: 'fit', pageObjectNumber: 3 }).success).toBe(true);
    expect(
      PdfDestinationSchema.safeParse({
        kind: 'fitR',
        pageObjectNumber: 3,
        left: 0,
        bottom: 0,
        right: 200,
        top: 300,
      }).success,
    ).toBe(true);
    // fitR without the full rect is malformed.
    expect(PdfDestinationSchema.safeParse({ kind: 'fitR', pageObjectNumber: 3 }).success).toBe(
      false,
    );
  });

  test('the full target union reads goto-remote/launch/unsupported', () => {
    const arms: PdfLinkTarget[] = [
      { kind: 'goto', destination: { kind: 'fit', pageObjectNumber: 5 } },
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
      // v2 parity: a link grouped to another annotation rides the base
      // relationship fields — nothing link-specific.
      inReplyTo: { kind: 'objectNumber', pageObjectNumber: 4, annotObjectNumber: 77 },
      replyType: 'group',
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
      target: { kind: 'goto', destination: { kind: 'xyz', pageObjectNumber: 9, top: 700 } },
    };
    const clear: LinkPatch = { subtype: 'link', target: null };
    const leave: LinkPatch = { subtype: 'link', rect: RECT };
    for (const patch of [retarget, clear, leave]) {
      expect(LinkPatchSchema.safeParse(patch).success).toBe(true);
      expect(AnnotationPatchSchema.safeParse(patch).success).toBe(true);
    }
  });
});
