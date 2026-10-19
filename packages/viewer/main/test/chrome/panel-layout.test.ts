/**
 * How a panel opens, by default and by its layout's `present` per size; how
 * wide it is, within its layout's `width` limits; and where its inner edge
 * goes from a drag or a key, on either side and in either writing direction.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PANEL_WIDTHS,
  clampPanelWidth,
  maxPanelWidthOf,
  overlayWidthOf,
  panelWidthsOf,
  presentationOf,
  widenDirectionOf,
  widthAfterDrag,
  widthAfterKey,
  type PanelEdge,
} from '../../../chrome/src/ui/panel-layout';

const widths = DEFAULT_PANEL_WIDTHS;
const edge = (side: PanelEdge['side'], dir: PanelEdge['dir'], viewerWidth = 1280): PanelEdge => ({
  side,
  dir,
  viewerWidth,
  widths,
});

describe('presentationOf', () => {
  it('docks in a wide viewer, overlays at medium widths, and is a sheet on a phone', () => {
    expect(presentationOf('expanded')).toBe('dock');
    expect(presentationOf('medium')).toBe('overlay');
    expect(presentationOf('compact')).toBe('sheet');
  });

  it('opens one way at every size, or per size with the default for the sizes left out', () => {
    expect(presentationOf('compact', 'dock')).toBe('dock');
    expect(presentationOf('medium', { medium: 'dock' })).toBe('dock');
    expect(presentationOf('compact', { medium: 'dock' })).toBe('sheet');
    expect(presentationOf('compact', { compact: 'overlay' })).toBe('overlay');
    expect(presentationOf('expanded', { compact: 'overlay' })).toBe('dock');
  });
});

describe('panel widths', () => {
  it('reads a layout width: a number is where it starts, the rest are the defaults', () => {
    expect(panelWidthsOf()).toEqual({ initial: 288, min: 200, max: 640 });
    expect(panelWidthsOf(360)).toEqual({ initial: 360, min: 200, max: 640 });
    expect(panelWidthsOf({ min: 280, max: 520 })).toEqual({ initial: 288, min: 280, max: 520 });
    // A narrowest wider than the widest is the widest.
    expect(panelWidthsOf({ min: 500, max: 400 })).toEqual({ initial: 288, min: 400, max: 400 });
  });

  it('never lets a docked panel take more than half the viewer, or less than its narrowest', () => {
    expect(maxPanelWidthOf(1280, widths)).toBe(640);
    expect(maxPanelWidthOf(1000, widths)).toBe(500);
    expect(maxPanelWidthOf(300, widths)).toBe(200);
    expect(clampPanelWidth(100, 1280, widths)).toBe(200);
    expect(clampPanelWidth(900, 1280, widths)).toBe(640);
    expect(clampPanelWidth(300.4, 1280, widths)).toBe(300);
  });

  it('keeps a panel within its own limits', () => {
    const own = panelWidthsOf({ initial: 360, min: 280, max: 520 });
    expect(clampPanelWidth(200, 1280, own)).toBe(280);
    expect(clampPanelWidth(600, 1280, own)).toBe(520);
    expect(maxPanelWidthOf(800, own)).toBe(400);
  });

  it('leaves some of the pages uncovered beside an overlay', () => {
    expect(overlayWidthOf(288, 800)).toBe(288);
    expect(overlayWidthOf(288, 300)).toBe(252);
  });
});

describe('the inner edge', () => {
  it('widens a start panel to the right and an end panel to the left, the other way in RTL', () => {
    expect(widenDirectionOf('start', 'ltr')).toBe(1);
    expect(widenDirectionOf('end', 'ltr')).toBe(-1);
    expect(widenDirectionOf('start', 'rtl')).toBe(-1);
    expect(widenDirectionOf('end', 'rtl')).toBe(1);
  });

  it('follows a drag, within the widths the viewer allows', () => {
    expect(widthAfterDrag(288, 40, edge('start', 'ltr'))).toBe(328);
    expect(widthAfterDrag(288, 40, edge('end', 'ltr'))).toBe(248);
    expect(widthAfterDrag(288, -40, edge('end', 'rtl'))).toBe(248);
    expect(widthAfterDrag(288, 2000, edge('start', 'ltr'))).toBe(640);
    expect(
      widthAfterDrag(288, 2000, { ...edge('start', 'ltr'), widths: panelWidthsOf({ max: 400 }) }),
    ).toBe(400);
  });

  it('moves with the arrow keys, four times as far with Shift, and Home and End go to the ends', () => {
    expect(widthAfterKey(288, 'ArrowRight', false, edge('start', 'ltr'))).toBe(304);
    expect(widthAfterKey(288, 'ArrowLeft', true, edge('start', 'ltr'))).toBe(224);
    expect(widthAfterKey(288, 'ArrowLeft', false, edge('end', 'ltr'))).toBe(304);
    expect(widthAfterKey(288, 'Home', false, edge('start', 'ltr'))).toBe(200);
    expect(widthAfterKey(288, 'End', false, edge('start', 'ltr', 1000))).toBe(500);
    expect(widthAfterKey(288, 'Enter', false, edge('start', 'ltr'))).toBeNull();
  });
});
