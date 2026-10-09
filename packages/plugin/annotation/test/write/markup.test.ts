/**
 * A text tool and the text selection (src/write/markup.ts): the selection
 * becomes what the tool makes of it, the same markup the direct creates make.
 */
import { quadFromRect } from '@embedpdf/core-geometry';
import { shapeOf } from '@embedpdf/core-annotation';
import { describe, expect, it, vi } from 'vitest';

import { annotationHarness, PAGE, PAGE2 } from '../harness';

const segment = (rect: { x: number; y: number; width: number; height: number }) => ({
  quad: quadFromRect(rect),
  rect,
  advance: 1 as const,
});
const PAGE_ONE = [segment({ x: 10, y: 20, width: 50, height: 12 })];
const PAGE_TWO = [
  segment({ x: 10, y: 20, width: 80, height: 12 }),
  segment({ x: 10, y: 34, width: 30, height: 12 }),
];

/** A selection from page one into page two, ending on page two's last glyph. */
const selectionAcrossPages = () => ({
  hasSelection: () => true,
  getSnapshot: () => ({
    pages: [
      { page: PAGE, segments: PAGE_ONE },
      { page: PAGE2, segments: PAGE_TWO },
    ],
    start: { page: PAGE, glyphQuad: PAGE_ONE[0]!.quad, advance: 1 },
    end: { page: PAGE2, glyphQuad: PAGE_TWO[1]!.quad, advance: 1 },
    direction: 'forward',
    range: null,
  }),
  clear: vi.fn(),
});

/** Every record's kind and shape, in order: what a write made, ids aside. */
const made = (harness: ReturnType<typeof annotationHarness>) =>
  harness
    .model()
    .order.map((id) => harness.model().byId[id]!.annotation)
    .map((annotation) => ({ subtype: annotation.subtype, shape: shapeOf(annotation) }));

describe('a text tool and the text selection', () => {
  it('a highlight tool marks each page’s selected text, and clears the selection', () => {
    const selection = selectionAcrossPages();
    const harness = annotationHarness({ selection });
    harness.seedToolDefaults();
    expect(harness.capability.applyToolToSelection('highlight')).toBe(true);
    const direct = annotationHarness();
    direct.seedToolDefaults();
    direct.capability.createMarkup('highlight', PAGE, [PAGE_ONE[0]!.quad], 'highlight');
    direct.capability.createMarkup(
      'highlight',
      PAGE2,
      PAGE_TWO.map((each) => each.quad),
      'highlight',
    );
    expect(made(harness)).toHaveLength(2);
    expect(made(harness)).toEqual(made(direct));
    expect(selection.clear).toHaveBeenCalledOnce();
  });

  it('replace text makes a pair per page, the caret at the selection’s end on its last page', () => {
    const harness = annotationHarness({ selection: selectionAcrossPages() });
    harness.seedToolDefaults();
    harness.capability.applyToolToSelection('replace-text');
    const direct = annotationHarness();
    direct.seedToolDefaults();
    // Page one anchors at its last segment's trailing edge; page two at the selection's end.
    direct.capability.createReplaceText(
      PAGE,
      [PAGE_ONE[0]!.quad],
      { glyphQuad: PAGE_ONE[0]!.quad, advance: 1 },
      'replace-text',
    );
    direct.capability.createReplaceText(
      PAGE2,
      PAGE_TWO.map((each) => each.quad),
      { glyphQuad: PAGE_TWO[1]!.quad, advance: 1 },
      'replace-text',
    );
    expect(made(harness).map((each) => each.subtype)).toEqual([
      'caret',
      'strikeout',
      'caret',
      'strikeout',
    ]);
    expect(made(harness)).toEqual(made(direct));
  });

  it('insert text puts a caret at the selection’s end', () => {
    const harness = annotationHarness({ selection: selectionAcrossPages() });
    harness.seedToolDefaults();
    harness.capability.applyToolToSelection('insert-text');
    const direct = annotationHarness();
    direct.capability.createCaret(PAGE2, { glyphQuad: PAGE_TWO[1]!.quad, advance: 1 });
    expect(made(harness)).toHaveLength(1);
    expect(made(harness)).toEqual(made(direct));
  });

  it('makes nothing, and keeps the selection, for the pointer tool or without create authority', () => {
    const selection = selectionAcrossPages();
    const harness = annotationHarness({ selection });
    harness.seedToolDefaults();
    expect(harness.capability.applyToolToSelection('pointer')).toBe(false);
    harness.allowsAnnotationCreate.mockReturnValue(false);
    expect(harness.capability.applyToolToSelection('highlight')).toBe(false);
    expect(harness.model().order).toEqual([]);
    expect(selection.clear).not.toHaveBeenCalled();
  });
});
