import { describe, expect, it, vi } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import type {
  HostTool,
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';

import type { StageHostCapability } from '../src/host-contract';
import { createScrollHandler } from '../src/scroll-handler';
import { createZoomDragHandler } from '../src/zoom-drag-handler';

const tool = (input: Partial<HostTool> & Pick<HostTool, 'id'>): HostTool => ({
  cursor: 'default',
  enables: new Set(),
  ...input,
});
const POINTER = tool({ id: 'pointer', enables: new Set(['text-select']) });
const PAN = tool({ id: 'pan', cursor: 'grab', gapCursor: 'grab', enables: new Set(['scroll']) });
const ZOOM = tool({
  id: 'zoom',
  cursor: 'zoom-in',
  gapCursor: 'zoom-in',
  enables: new Set(['zoom-box']),
});

const NO_KEYS = { shift: false, alt: false, ctrl: false, meta: false };
const sample = (phase: PointerSample['phase'], input: Partial<PointerSample> = {}) =>
  ({
    phase,
    viewport: { x: 40, y: 60 },
    modifiers: NO_KEYS,
    source: 'stage',
    ...input,
  }) as PointerSample;

function fakes() {
  const stage = {
    getLensId: () => 'stage',
    beginZoomDrag: vi.fn(),
    moveZoomDrag: vi.fn(),
    endZoomDrag: vi.fn(),
    cancelZoomDrag: vi.fn(),
    panBy: vi.fn(),
  } as unknown as StageHostCapability;
  const interaction = {
    claimCursor: vi.fn(),
    getActiveTool: () => ZOOM,
  } as unknown as InteractionHostCapability;
  return { stage, interaction };
}

describe('the zoom drag handler', () => {
  it('is live under the zoom tool only', () => {
    const { stage, interaction } = fakes();
    const handler = createZoomDragHandler(stage, interaction);
    expect(handler.enabledFor(ZOOM)).toBe(true);
    expect(handler.enabledFor(POINTER)).toBe(false);
    expect(handler.enabledFor(PAN)).toBe(false);
  });

  it("takes its lens's presses, on a page or between pages, and forwards the drag in viewport px", () => {
    const { stage, interaction } = fakes();
    const handler = createZoomDragHandler(stage, interaction);
    expect(handler.onDown(sample('down'))).toBe(true);
    expect(stage.beginZoomDrag).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(
      handler.onDown(sample('down', { page: { ref: toPageRef(1), point: { x: 1, y: 2 } } })),
    ).toBe(true);
    handler.onMove!(sample('move', { viewport: { x: 90, y: 100 } }));
    expect(stage.moveZoomDrag).toHaveBeenCalledWith({ x: 90, y: 100 });
    handler.onUp!(sample('up'));
    expect(stage.endZoomDrag).toHaveBeenCalledWith({ zoomOut: false });
    handler.onCancel!(sample('cancel'));
    expect(stage.cancelZoomDrag).toHaveBeenCalled();
  });

  it("leaves another surface's press alone: its px are another element's", () => {
    const { stage, interaction } = fakes();
    const handler = createZoomDragHandler(stage, interaction);
    expect(handler.onDown(sample('down', { source: undefined }))).toBe(false);
    expect(handler.onDown(sample('down', { source: 'stage-thumbs' }))).toBe(false);
    expect(stage.beginZoomDrag).not.toHaveBeenCalled();
  });

  it('zooms out on an Alt click, and shows the zoom-out cursor while Alt is held', () => {
    const { stage, interaction } = fakes();
    const handler = createZoomDragHandler(stage, interaction);
    const alt = { ...NO_KEYS, alt: true };
    handler.onUp!(sample('up', { modifiers: alt }));
    expect(stage.endZoomDrag).toHaveBeenCalledWith({ zoomOut: true });
    handler.onHover!(sample('move', { modifiers: alt }));
    expect(interaction.claimCursor).toHaveBeenLastCalledWith('stage-zoom-out', 'zoom-out');
    handler.onHover!(sample('move'));
    expect(interaction.claimCursor).toHaveBeenLastCalledWith('stage-zoom-out', null);
  });
});

describe('the scroll handler beside the zoom tool', () => {
  it('pans the gaps under a tool that acts only on pages, but leaves them to the zoom tool', () => {
    const { stage, interaction } = fakes();
    const handler = createScrollHandler(stage, interaction);
    expect(handler.enabledFor(POINTER)).toBe(true);
    expect(handler.enabledFor(PAN)).toBe(true);
    expect(handler.enabledFor(ZOOM)).toBe(false);
  });
});
