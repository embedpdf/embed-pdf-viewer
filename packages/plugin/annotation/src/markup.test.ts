import { describe, expect, it, vi } from 'vitest';
import type { InteractionCapability } from '@embedpdf/plugin-interaction';
import type { SelectionCapability } from '@embedpdf/plugin-selection';

import { wireMarkup } from './markup';
import type { AnnotationHostCapability } from './types';

describe('selection authoring bridge', () => {
  it('previews and commits Replace Text from its declarative tool recipe', () => {
    const page1 = [{ x: 10, y: 20, width: 50, height: 12 }];
    const page2 = [
      { x: 10, y: 20, width: 80, height: 12 },
      { x: 10, y: 34, width: 30, height: 12 },
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
          { pon: 1, rects: page1 },
          { pon: 2, rects: page2 },
        ],
        start: { pon: 1, rect: page1[0] },
        end: { pon: 2, rect: page2[1] },
        direction: 'forward' as const,
      }),
      rectsForPage: (pon: number) => (pon === 1 ? page1 : page2),
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
    } as unknown as SelectionCapability;
    const interaction = {
      activeToolId: () => 'replace-text',
      onToolChange: vi.fn(() => () => {}),
    } as unknown as InteractionCapability;

    wireMarkup(annotation, selection, interaction);
    onChange();
    expect(selection.setHighlightVisible).toHaveBeenCalledWith(false);
    expect(annotation.previewMarkup).toHaveBeenCalledWith(
      'strikeout',
      { 1: page1, 2: page2 },
      'replace-text',
    );

    onCommit();
    expect(annotation.createReplaceText).toHaveBeenNthCalledWith(
      1,
      1,
      page1,
      page1[0],
      'replace-text',
    );
    expect(annotation.createReplaceText).toHaveBeenNthCalledWith(
      2,
      2,
      page2,
      page2[1],
      'replace-text',
    );
    expect(selection.clear).toHaveBeenCalledOnce();
  });
});
