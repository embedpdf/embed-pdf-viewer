import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE } from '../harness';
import { annotationOfTool, iconPlaceAt } from '../../src/write/placement';

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
    // The page paints it at its own view, as it paints the made note.
    const ghost = harness.capability
      .listPageItems(PAGE, { zoom: 2, rotation: 90 })
      .find((item) => item.id === 'tool-ghost');
    const tool = harness.capability.getResolvedTool('note')!;
    const { shown } = iconPlaceAt(
      annotationOfTool(harness.model(), tool),
      point,
      { width: 600, height: 800 },
      { zoom: 2, rotation: 90 },
    );
    // Painted from the rect the click stores, as the made note is: the same
    // box up to float noise.
    if (ghost?.geometry.kind !== 'box') throw new Error('expected a box');
    expect(ghost.geometry.rotation).toBe(shown.rotation);
    for (const side of ['x', 'y', 'width', 'height'] as const)
      expect(ghost.geometry.box[side]).toBeCloseTo(shown.box[side]);
    // Turned back against the page, so it reads upright on screen.
    expect(ghost?.rot).toBe(270);
  });
});

describe('a click tool’s ghost', () => {
  const ghostOf = (harness: ReturnType<typeof annotationHarness>) =>
    harness.capability.listPageItems(PAGE).find((item) => item.id === 'tool-ghost');

  it('draws what the click makes, see-through, with the tool’s live defaults', () => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.tools.register({ id: 'square', ghost: true });
    harness.capability.hoverGhostAt('square', PAGE, { x: 100, y: 100 });
    expect(ghostOf(harness)).toMatchObject({
      source: 'ghost',
      ghostOpacity: 0.5,
      geometry: { kind: 'box', box: { x: 60, y: 70, width: 80, height: 60 }, ellipse: false },
      style: { color: '#e5484d', strokeWidth: 6 },
    });
    // A new color shows at once, without a new hover.
    harness.capability.tools.updateDefaults('square', { color: '#00a000' });
    expect(ghostOf(harness)?.style.color).toBe('#00a000');
  });

  it('an arrow’s ghost is centred on the pointer, its head drawn', () => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.tools.register({
      id: 'arrow',
      extends: 'line',
      defaults: { lineEndings: { start: 'none', end: 'open-arrow' } },
      ghost: true,
    });
    harness.capability.hoverGhostAt('arrow', PAGE, { x: 100, y: 100 });
    expect(ghostOf(harness)?.geometry).toEqual({
      kind: 'line',
      linePoints: { start: { x: 60, y: 100 }, end: { x: 140, y: 100 } },
      lineEndings: { start: 'none', end: 'open-arrow' },
      rotation: 0,
    });
  });

  it('a tool without a ghost, or whose click makes nothing, shows none', () => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.hoverGhostAt('circle', PAGE, { x: 100, y: 100 }); // drag-first: off
    expect(ghostOf(harness)).toBeUndefined();
    harness.capability.tools.register({ id: 'ink', ghost: true }); // a click draws no ink
    harness.capability.hoverGhostAt('ink', PAGE, { x: 100, y: 100 });
    expect(ghostOf(harness)).toBeUndefined();
  });

  it('stays while the press is still a click, and gives way to the drawing once it drags', () => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.tools.register({ id: 'square', ghost: true });
    const at = { x: 100, y: 100 };
    harness.capability.hoverGhostAt('square', PAGE, at);
    harness.capability.createPointer('square', 'down', PAGE, at);
    harness.capability.createPointer('square', 'move', PAGE, { x: 101, y: 101 });
    const items = () => harness.capability.listPageItems(PAGE);
    expect(items().map((item) => item.source)).toEqual(['ghost']);
    harness.capability.createPointer('square', 'move', PAGE, { x: 160, y: 140 });
    expect(items().map((item) => item.source)).toEqual(['draft']);
  });

  it('a form tool’s placement: the ghost until it drags, then the field it places; a radio is round', () => {
    const harness = annotationHarness();
    harness.capability.tools.register({
      id: 'form-radio',
      subtype: 'widget-radio',
      enables: ['form-place', 'annotation-edit'],
      clickCreate: { width: 18, height: 18 },
      defaults: { interiorColor: '#ffffff', color: '#6b7280', strokeWidth: 1 },
      ghost: true,
    });
    harness.capability.hoverGhostAt('form-radio', PAGE, { x: 100, y: 100 });
    expect(ghostOf(harness)).toMatchObject({
      subtype: 'widget-radio',
      geometry: { box: { x: 91, y: 91, width: 18, height: 18 }, ellipse: true },
      style: { color: '#6b7280', interiorColor: '#ffffff' },
    });
    harness.capability.previewPlacement('form-radio', PAGE, { x: 100, y: 100 }, { x: 101, y: 100 });
    expect(harness.capability.listPageItems(PAGE).map((item) => item.source)).toEqual(['ghost']);
    harness.capability.previewPlacement('form-radio', PAGE, { x: 100, y: 100 }, { x: 140, y: 130 });
    expect(harness.capability.listPageItems(PAGE)).toMatchObject([
      {
        source: 'draft',
        geometry: { box: { x: 100, y: 100, width: 40, height: 30 }, ellipse: true },
      },
    ]);
    harness.capability.clearPlacementPreview();
    harness.capability.clearGhost();
    expect(harness.capability.listPageItems(PAGE)).toEqual([]);
  });
});
