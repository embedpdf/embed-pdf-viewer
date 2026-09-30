import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE } from '../harness';
import { iconAnnotationOf, iconPlaceAt } from '../../src/write/placement';

describe('the tool ghost', () => {
  it.each([
    ['note', 'comment'],
    ['attachment', 'paperclip'],
  ])('the %s tool’s ghost draws the icon it places', (toolId, icon) => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.hoverGhostAt(toolId, PAGE, { x: 100, y: 100 });
    const ghost = harness.capability.listPageItems(PAGE).find((item) => item.id === 'tool-ghost');
    expect(ghost?.icon).toBe(icon);
  });

  it('on a turned, zoomed page, the note’s ghost is the icon as the click will show it', () => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    const point = { x: 100, y: 100 };
    harness.capability.hoverGhostAt('note', PAGE, point, 90, 2);
    const ghost = harness.capability.listPageItems(PAGE).find((item) => item.id === 'tool-ghost');
    const tool = harness.capability.getResolvedTool('note')!;
    const { shown } = iconPlaceAt(
      iconAnnotationOf(harness.model(), tool),
      point,
      { width: 600, height: 800 },
      { zoom: 2, rotation: 90 },
    );
    expect(ghost?.geometry).toEqual(shown);
    // Turned back against the page, so it reads upright on screen.
    expect(ghost?.rot).toBe(270);
  });
});
