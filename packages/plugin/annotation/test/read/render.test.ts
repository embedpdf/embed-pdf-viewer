import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation } from '../harness';
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

describe('the frame a painter draws into', () => {
  const note = {
    ref: { kind: 'objectNumber', page: PAGE, objectNumber: 70 },
    page: PAGE,
    index: 0,
    subtype: 'text',
    rect: { left: 100, bottom: 600, right: 124, top: 624 },
    color: '#ffff00',
    opacity: 1,
    icon: 'note',
    state: null,
    stateModel: null,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    contents: '',
    author: 'A',
    name: 'n70',
  } as unknown as FileAnnotation;
  const frameAt = (harness: ReturnType<typeof annotationHarness>, zoom: number) =>
    harness.capability.listPageItems(PAGE, { zoom, rotation: 0 }).find((item) => item.ref)!.frame;

  it('a note keeps its size on screen: zoomed in, the page draws it smaller', async () => {
    const harness = annotationHarness();
    await harness.load([note]);
    expect(frameAt(harness, 2).scale).toBe(0.5);
    // Below 100% it shrinks with the page, so its frame is its own size there.
    expect(frameAt(harness, 0.5).scale).toBe(1);
  });

  it('everything else is drawn at its own size on the page', async () => {
    const harness = annotationHarness();
    const square = {
      ...note,
      subtype: 'square',
      rect: { left: 100, bottom: 700, right: 180, top: 760 },
      box: { left: 100, bottom: 700, right: 180, top: 760 },
      color: '#000000',
      strokeWidth: 2,
    } as unknown as FileAnnotation;
    await harness.load([square]);
    expect(frameAt(harness, 2).scale).toBe(1);
  });
});

/** The first bytes of a PNG `width` × `height`: as much as a sniff reads. */
const pngOf = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

describe('a stamp before the engine wrote it', () => {
  it('shows the picture it was placed with at once, and the engine’s once that exists', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const png = pngOf(200, 100);
    let answer!: () => void;
    harness.create.mockImplementationOnce(
      (draft: { box: { x: number; y: number; width: number; height: number } }) =>
        new Promise((resolve) => {
          const { x, y, width, height } = draft.box;
          const rect = { left: x, bottom: 800 - y - height, right: x + width, top: 800 - y };
          answer = () =>
            resolve({
              annotation: {
                ref: { kind: 'objectNumber', page: PAGE, objectNumber: 1 },
                page: PAGE,
                subtype: 'stamp',
                rect,
                box: rect,
                rotation: null,
                fit: 'contain',
                name: null,
                opacity: 1,
                hasAppearance: true,
              } as unknown as FileAnnotation,
            });
        }),
    );
    // The page's pictures as the engine drew them, before the stamp.
    expect(await harness.capability.renderAppearances(PAGE, 2)).toEqual([]);
    expect(harness.renderAppearances).toHaveBeenCalledTimes(1);
    await harness.capability.stamps.arm({ source: png });
    expect(harness.capability.placeArmedStamp(PAGE, { x: 300, y: 400 })).toBe(true);
    await Promise.resolve();

    const [id] = harness.model().order;
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`${id}@placed`);
    const [picture, ...rest] = await harness.capability.renderAppearances(PAGE, 2);
    expect(rest).toEqual([]);
    // The engine's pictures didn't change: it isn't asked again, so nothing waits for it.
    expect(harness.renderAppearances).toHaveBeenCalledTimes(1);
    expect(picture).toMatchObject({
      ref: harness.model().byId[id!]!.annotation.ref,
      mode: 'normal',
      state: null,
      rect: harness.model().byId[id!]!.apBox,
    });
    const blob = await picture!.image.blob();
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);

    // The engine's picture is there now: the page fetches it, and the placed one is gone.
    answer();
    await harness.ctx.changes.whenSettled();
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`${id}@1:`);
    expect(await harness.capability.renderAppearances(PAGE, 2)).toEqual([]);
    expect(harness.renderAppearances).toHaveBeenCalledTimes(2);
  });
});

describe('an annotation an undo brings back', () => {
  it('shows the picture the engine drew of it at once, until the engine draws it again', async () => {
    const harness = annotationHarness();
    const rect = { left: 100, bottom: 600, right: 200, top: 660 };
    const stamp = {
      ref: { kind: 'objectNumber', page: PAGE, objectNumber: 30 },
      page: PAGE,
      subtype: 'stamp',
      rect,
      box: rect,
      rotation: null,
      fit: 'contain',
      name: null,
      opacity: 1,
      hasAppearance: true,
      appearanceState: null,
    } as unknown as FileAnnotation;
    await harness.load([stamp]);
    const ref = harness.read(stamp).ref;
    const picture = {
      ref,
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([picture]);

    await harness.capability.delete(ref);
    const deleted = harness.applied.at(-1)!;
    harness.ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: deleted.opId,
      shows: [{ type: 'annotations.restore', annotation: harness.read(stamp), index: 0 }],
    });
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe('obj:30@kept');
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([picture]);
  });

  it('undone before the engine answered, the page shows the pictures it had, asking the engine for nothing', async () => {
    const harness = annotationHarness();
    const rect = { left: 100, bottom: 600, right: 200, top: 660 };
    const stamp = {
      ref: { kind: 'objectNumber', page: PAGE, objectNumber: 30 },
      page: PAGE,
      subtype: 'stamp',
      rect,
      box: rect,
      rotation: null,
      fit: 'contain',
      name: null,
      opacity: 1,
      hasAppearance: true,
      appearanceState: null,
    } as unknown as FileAnnotation;
    await harness.load([stamp]);
    const ref = harness.read(stamp).ref;
    const picture = {
      ref,
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    const before = harness.capability.getAppearanceEpoch(PAGE);
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([picture]);

    // The delete stays on its way; the page without the stamp is drawn meanwhile.
    let answer!: () => void;
    harness.remove.mockReturnValueOnce(new Promise((done) => (answer = () => done({}))));
    const deleting = harness.capability.delete(ref);
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [] });
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([]);
    const deleted = harness.ctx.changes.pending().at(-1)!;
    harness.ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: deleted.opId,
      shows: [{ type: 'annotations.restore', annotation: harness.read(stamp), index: 0 }],
    });

    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(before);
    const asked = harness.renderAppearances.mock.calls.length;
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([picture]);
    expect(harness.renderAppearances.mock.calls.length).toBe(asked);
    answer();
    await deleting;
  });
});
