import { describe, expect, it, vi } from 'vitest';
import { textQuadFromRect } from '@embedpdf/core-geometry';
import type { InteractionCapability } from '@embedpdf/plugin-interaction';
import type { SelectionHostCapability } from '@embedpdf/plugin-selection/internal';

import { wireMarkup } from './markup';
import type { AnnotationHostCapability } from './types';

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
      tool: () => ({
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
      snapshot: () => ({
        pages: [
          { pon: 1, segments: page1, rects: page1.map((s) => s.rect) },
          { pon: 2, segments: page2, rects: page2.map((s) => s.rect) },
        ],
        start: { pon: 1, glyphQuad: page1[0].quad, advance: 1 as const, rect: page1[0].rect },
        end: { pon: 2, glyphQuad: page2[1].quad, advance: 1 as const, rect: page2[1].rect },
        direction: 'forward' as const,
      }),
      segmentsForPage: (pon: number) => (pon === 1 ? page1 : page2),
      setHighlightVisible: vi.fn(),
      clear: vi.fn(),
      onChange: (cb: () => void) => {
        onChange = cb;
        return () => {};
      },
      onCommit: (cb: () => void) => {
        onCommit = cb;
        return () => {};
      },
    } as unknown as SelectionHostCapability;
    const interaction = {
      activeToolId: () => 'replace-text',
      onToolChange: vi.fn(() => () => {}),
    } as unknown as InteractionCapability;

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
      1,
      page1.map((s) => s.quad),
      { glyphQuad: page1[0].quad, advance: 1 },
      'replace-text',
    );
    expect(annotation.createReplaceText).toHaveBeenNthCalledWith(
      2,
      2,
      page2.map((s) => s.quad),
      { glyphQuad: page2[1].quad, advance: 1 },
      'replace-text',
    );
    expect(selection.clear).toHaveBeenCalledOnce();
  });
});
