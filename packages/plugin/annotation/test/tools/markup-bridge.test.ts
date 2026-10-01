import { quadFromRect } from '@embedpdf/core-geometry';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { InteractionHostCapability } from '@embedpdf/plugin-interaction/contract/host';
import type { SelectionHostCapability } from '@embedpdf/plugin-selection/contract/host';
import { describe, expect, it, vi } from 'vitest';

import type { AnnotationHostCapability } from '../../src/host-contract';
import { wireMarkup } from '../../src/tools/markup-bridge';

describe('selection authoring bridge', () => {
  /** The bridge wired to fakes; its listeners, to fire by hand. */
  const wired = (options: { gestureActive?: boolean } = {}) => {
    const listeners = { changed: () => {}, committed: () => {}, toolChanged: () => {} };
    const segments = [
      {
        quad: quadFromRect({ x: 10, y: 20, width: 50, height: 12 }),
        rect: { x: 10, y: 20, width: 50, height: 12 },
        advance: 1 as const,
      },
    ];
    const annotation = {
      getResolvedTool: () => ({
        id: 'replace-text',
        subtype: 'strikeout',
        preset: 'replace-text',
        selection: { kind: 'text-edit', operation: 'replace' },
      }),
      previewMarkup: vi.fn(),
      clearMarkupPreview: vi.fn(),
      applyToolToSelection: vi.fn(() => true),
    } as unknown as AnnotationHostCapability;
    const selection = {
      hasSelection: () => true,
      isSelecting: () => options.gestureActive ?? false,
      getSnapshot: () => ({ pages: [{ page: toPageRef(1), segments }] }),
      setHighlightVisible: vi.fn(),
      onChanged: (callback: () => void) => {
        listeners.changed = callback;
        return () => {};
      },
      onCommitted: (callback: () => void) => {
        listeners.committed = callback;
        return () => {};
      },
    } as unknown as SelectionHostCapability;
    const interaction = {
      getActiveToolId: () => 'replace-text',
      onToolChanged: (callback: () => void) => {
        listeners.toolChanged = callback;
        return () => {};
      },
    } as unknown as InteractionHostCapability;
    wireMarkup(annotation, selection, interaction);
    return { annotation, selection, listeners, segments };
  };

  it('previews the selection as the text tool’s markup while it is dragged', () => {
    const { annotation, selection, listeners, segments } = wired();
    listeners.changed();
    expect(selection.setHighlightVisible).toHaveBeenCalledWith(false);
    expect(annotation.previewMarkup).toHaveBeenCalledWith(
      'strikeout',
      { 1: segments.map((segment) => segment.quad) },
      'replace-text',
    );
  });

  it('a selection committed with a text tool active becomes its markup', () => {
    const { annotation, listeners } = wired();
    listeners.committed();
    expect(annotation.applyToolToSelection).toHaveBeenCalledWith('replace-text');
  });

  it('picking a text tool with text selected makes its markup at once', () => {
    const { annotation, listeners } = wired();
    listeners.toolChanged();
    expect(annotation.applyToolToSelection).toHaveBeenCalledWith('replace-text');
  });

  it('picking a text tool mid-drag waits: the drag’s end makes it', () => {
    const { annotation, listeners } = wired({ gestureActive: true });
    listeners.toolChanged();
    expect(annotation.applyToolToSelection).not.toHaveBeenCalled();
  });
});
