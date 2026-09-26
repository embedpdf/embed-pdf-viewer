import { textQuadFromRect } from '@embedpdf/core-geometry';
import { toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';
import type { InteractionHostCapability } from '@embedpdf/plugin-interaction/contract/host';
import type { SelectionHostCapability } from '@embedpdf/plugin-selection/contract/host';
import { describe, expect, it, vi } from 'vitest';

import { wireMarkup } from '../../src/tools/markup-bridge';
import type { AnnotationHostCapability } from '../../src/host-contract';

describe('selection authoring bridge', () => {
  it('previews and commits Replace Text from its declarative tool recipe', () => {
    const seg = (r: { x: number; y: number; width: number; height: number }) => ({
      quad: textQuadFromRect(r),
      rect: r,
      advance: 1 as const,
    });
    const page1 = [seg({ x: 10, y: 20, width: 50, height: 12 })];
    const page2 = [
      seg({ x: 10, y: 20, width: 80, height: 12 }),
      seg({ x: 10, y: 34, width: 30, height: 12 }),
    ];
    let onChange: () => void = () => {};
    let onCommit: () => void = () => {};
    const annotation = {
      getResolvedTool: () => ({
        id: 'replace-text',
        subtype: 'strikeout',
        preset: 'replace-text',
        selection: { kind: 'text-edit', operation: 'replace' },
      }),
      previewMarkup: vi.fn(),
      clearMarkupPreview: vi.fn(),
      createReplaceText: vi.fn(),
    } as unknown as AnnotationHostCapability;
    const selection = {
      hasSelection: () => true,
      getSnapshot: () => ({
        pages: [
          { page: toPageRef(1), segments: page1, rects: page1.map((s) => s.rect) },
          { page: toPageRef(2), segments: page2, rects: page2.map((s) => s.rect) },
        ],
        start: {
          page: toPageRef(1),
          glyphQuad: page1[0].quad,
          advance: 1 as const,
          rect: page1[0].rect,
        },
        end: {
          page: toPageRef(2),
          glyphQuad: page2[1].quad,
          advance: 1 as const,
          rect: page2[1].rect,
        },
        direction: 'forward' as const,
      }),
      listSegments: (page: PageRef) => (page.pageObjectNumber === 1 ? page1 : page2),
      setHighlightVisible: vi.fn(),
      clear: vi.fn(),
      onChanged: (cb: () => void) => {
        onChange = cb;
        return () => {};
      },
      onCommitted: (cb: () => void) => {
        onCommit = cb;
        return () => {};
      },
    } as unknown as SelectionHostCapability;
    const interaction = {
      getActiveToolId: () => 'replace-text',
      onToolChanged: vi.fn(() => () => {}),
    } as unknown as InteractionHostCapability;

    wireMarkup(annotation, selection, interaction);
    onChange();
    expect(selection.setHighlightVisible).toHaveBeenCalledWith(false);
    expect(annotation.previewMarkup).toHaveBeenCalledWith(
      'strikeout',
      { 1: page1.map((s) => s.quad), 2: page2.map((s) => s.quad) },
      'replace-text',
    );

    onCommit();
    expect(annotation.createReplaceText).toHaveBeenNthCalledWith(
      1,
      toPageRef(1),
      page1.map((s) => s.quad),
      { glyphQuad: page1[0].quad, advance: 1 },
      'replace-text',
    );
    expect(annotation.createReplaceText).toHaveBeenNthCalledWith(
      2,
      toPageRef(2),
      page2.map((s) => s.quad),
      { glyphQuad: page2[1].quad, advance: 1 },
      'replace-text',
    );
    expect(selection.clear).toHaveBeenCalledOnce();
  });
});
