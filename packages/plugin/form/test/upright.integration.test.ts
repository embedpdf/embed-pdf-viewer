/**
 * Turned fields on a real engine, through the form plugin and the annotation plugin's
 * design mode. The fixture's fields are turned as Acrobat turns them (`/MK /R`): each
 * reads as its frame, its quarter turn and the rect it stands in, fills in, and saves
 * back. A field placed with a form tool on a page shown turned reads upright there, the
 * quarter-turn command turns a selected field, and Orientation turns its contents where
 * it stands.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { gesturePlacement, orientationPatch } from '@embedpdf/core-annotation';
import { createLocalEngine } from '@embedpdf/engine';
import { TURNED_FIELDS_PDF } from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  toPageRef,
  type AnnotationRef,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin, InteractionToken } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { FORM_TOOL_BY_ID } from '../src/tools/definitions';
import { placedOnPage, toolDraft } from '../src/tools/handlers';
import { gated } from './helpers/fill-form';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

/** The fixture's first page, upright, and its second, shown turned 90° (`/Rotate 90`). */
const FIRST = toPageRef(3);
const TURNED = toPageRef(4);
const PAGE_BOX = { x: 0, y: 0, width: 300, height: 300 };

const fqn = (name: string): FormFieldRef => ({ kind: 'fqn', name });

/** `box` with its sides swapped about its middle: where it stands turned a quarter. */
const swapped = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + (box.width - box.height) / 2,
  y: box.y + (box.height - box.width) / 2,
  width: box.height,
  height: box.width,
});

const rounded = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, each: unknown) =>
      typeof each === 'number' ? Number(each.toFixed(3)) : each,
    ),
  ) as T;

async function boot(bytes: Uint8Array = TURNED_FIELDS_PDF) {
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    // The engine's own handle, for reading the saved bytes; nothing is held back.
    engine: gated(
      engine,
      [],
      (doc) => (inner = doc),
      () => false,
    ),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open({
    kind: 'bytes',
    id: `upright-${Math.random()}`,
    bytes: bytes.slice(),
  });
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await form.ensureLoaded(FIRST);
  await form.ensureLoaded(TURNED);
  await annotation.whenSynced();
  const widgetOf = (name: string): AnnotationRef => {
    const widget = form.get(fqn(name))!.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  const itemOf = (name: string) => {
    const ref = widgetOf(name);
    return form
      .listWidgets(ref.page)
      .find((item) => item.annotObjectNumber === (ref as { objectNumber: number }).objectNumber)!;
  };
  return {
    kernel,
    doc,
    form,
    annotation,
    interaction,
    history,
    widgetOf,
    itemOf,
    destroy: () => kernel.destroy(),
  };
}

describe('turned fields, on a real engine', () => {
  it('a fill item carries the frame, the turn and the rect of a field Acrobat turned', async () => {
    const booted = await boot();
    try {
      const { itemOf } = booted;
      // `/MK /R 90` (counterclockwise in the file) reads as 270° clockwise.
      const r90 = itemOf('r90');
      expect(r90.rotation).toBe(270);
      // /Rect [20 20 44 180] on a 300-high page: 24 wide, 160 tall, from the top-left.
      expect(rounded(r90.rect)).toEqual({ x: 20, y: 120, width: 24, height: 160 });
      // The frame its contents are laid out in: that rect, its sides swapped.
      expect(rounded(r90.box)).toEqual(swapped({ x: 20, y: 120, width: 24, height: 160 }));

      expect(itemOf('r180').rotation).toBe(180);
      expect(rounded(itemOf('r180').box)).toEqual(rounded(itemOf('r180').rect));
      expect(itemOf('r270').rotation).toBe(90);
      // An unturned field: nothing changes, its frame is its rect.
      const upright = itemOf('upright');
      expect(upright.rotation).toBe(0);
      expect(upright.box).toEqual(upright.rect);
      // A turn no viewer draws (`/R 45`) reads upright.
      expect(itemOf('odd').rotation).toBe(0);
      // An upright field on the turned page, as Acrobat adds one.
      expect(itemOf('on-turned').rotation).toBe(270);
    } finally {
      await booted.destroy();
    }
  });

  it('a point is on a turned field where it stands', async () => {
    const booted = await boot();
    try {
      const { form } = booted;
      // r90 stands at x 20..44, y 120..280.
      const hit = form.getWidgetAt(FIRST, { x: 30, y: 200 });
      expect(hit?.field.name).toBe('r90');
      expect(hit?.rotation).toBe(270);
      expect(rounded(hit!.rect)).toEqual({ x: 20, y: 120, width: 24, height: 160 });
      // Inside the frame before its turn, but not where the field stands.
      expect(form.getWidgetAt(FIRST, { x: 100, y: 200 })).toBeNull();
    } finally {
      await booted.destroy();
    }
  });

  it('a turned field fills in, keeps its turn, and saves back', async () => {
    const booted = await boot();
    let bytes: Uint8Array;
    try {
      const { form, doc, itemOf } = booted;
      const result = await form.setValue(fqn('r90'), { value: 'Sideways' });
      expect(result.status).toBe('applied');
      const filled = itemOf('r90');
      expect(filled.control === 'text' && filled.value).toBe('Sideways');
      expect(filled.rotation).toBe(270);
      bytes = await doc.download();
    } finally {
      await booted.destroy();
    }
    // The saved file reads the same: the value, the turn and the place.
    const again = await boot(bytes);
    try {
      const item = again.itemOf('r90');
      expect(item.control === 'text' && item.value).toBe('Sideways');
      expect(item.rotation).toBe(270);
      expect(rounded(item.rect)).toEqual({ x: 20, y: 120, width: 24, height: 160 });
    } finally {
      await again.destroy();
    }
  });

  it('a form tool on a page shown turned places a field that reads upright there', async () => {
    const booted = await boot();
    try {
      const { form, annotation } = booted;
      const tool = FORM_TOOL_BY_ID.get('form-text')!;
      // The form tools are upright in the annotation plugin's registry, where the ghost reads it.
      expect(annotation.getResolvedTool('form-text')?.upright).toBe(true);
      // A click at (150, 150) on the page the viewer shows turned 90°.
      const placement = gesturePlacement(
        'box',
        { x: 150, y: 150 },
        { x: 150, y: 150 },
        tool.clickCreate,
        {
          pageBox: PAGE_BOX,
          upright: annotation.getResolvedTool('form-text')!.upright,
          displayRotation: 90,
        },
      );
      if (placement?.kind !== 'box') throw new Error('a click places a box');
      const placed = placedOnPage(placement, PAGE_BOX)!;
      expect(placed).toEqual({ box: { x: 70, y: 138, width: 160, height: 24 }, rotation: 270 });
      const { field } = await form.create(
        toolDraft(tool, 'placed', { page: TURNED, ...placed, ...tool.defaults }),
      );
      const ref = field.widgets[0]!.ref!;
      // At once, as the plugin predicts it, and as the engine wrote it: the same place.
      const row = form.getWidget(ref)!;
      expect(row.rotation).toBe(270);
      expect(rounded(row.box)).toEqual({ x: 70, y: 138, width: 160, height: 24 });
      // It stands 24 wide and 160 tall on the page, so it shows 160 × 24 on the turned page.
      expect(rounded(row.rect)).toEqual({ x: 138, y: 70, width: 24, height: 160 });
      const item = booted.itemOf('placed');
      expect(item).toMatchObject({ rotation: 270 });
      expect(rounded(item.box)).toEqual({ x: 70, y: 138, width: 160, height: 24 });
      expect(rounded(item.rect)).toEqual({ x: 138, y: 70, width: 24, height: 160 });
      // Typed into, it keeps its turn.
      await form.setValue(field.ref, { value: 'Upright' });
      expect(form.getWidget(ref)!.rotation).toBe(270);
    } finally {
      await booted.destroy();
    }
  });

  it('in design mode a turned field is a turned box: its frame, its turn, its picture where it stands', async () => {
    const booted = await boot();
    try {
      const { annotation, interaction, widgetOf } = booted;
      interaction.activateTool('form-edit');
      await annotation.whenSynced();
      const ref = widgetOf('r90');
      const item = annotation.listPageItems(FIRST).find((each) => each.id === annotationKey(ref))!;
      expect(item.frame.rotation).toBe(270);
      expect(rounded(item.frame.box)).toEqual(swapped({ x: 20, y: 120, width: 24, height: 160 }));
      // Its picture holds its turn: placed where the field stands, turned back in the frame.
      expect(rounded(item.apBox)).toEqual({ x: 20, y: 120, width: 24, height: 160 });
      expect(item.raster?.rotation).toBe(90);
    } finally {
      await booted.destroy();
    }
  });

  it('the quarter-turn command turns a selected field, and an undo turns it back', async () => {
    const booted = await boot();
    try {
      const { form, annotation, interaction, history } = booted;
      interaction.activateTool('form-edit');
      // A field in the middle of the page, with room to turn where it stands.
      const { field } = await form.create({
        kind: 'text',
        name: 'roomy',
        widgets: [{ page: FIRST, box: { x: 70, y: 138, width: 160, height: 24 } }],
      });
      await annotation.whenSynced();
      const ref = field.widgets[0]!.ref!;
      const before = form.getWidget(ref)!;
      expect(before.rotation ?? 0).toBe(0);
      annotation.selection.select([ref]);
      await annotation.selection.rotateBy(90);
      const turned = form.getWidget(ref)!;
      expect(turned.rotation).toBe(90);
      // The whole box turned about its middle: its frame stays, it stands the other way.
      expect(rounded(turned.box)).toEqual(rounded(before.rect));
      expect(rounded(turned.rect)).toEqual(rounded(swapped(before.rect)));
      await annotation.selection.rotateBy(-90);
      expect(form.getWidget(ref)!.rotation ?? 0).toBe(0);
      expect(rounded(form.getWidget(ref)!.rect)).toEqual(rounded(before.rect));
      await history.undo();
      expect(form.getWidget(ref)!.rotation).toBe(90);
      await annotation.selection.resetRotation();
      expect(form.getWidget(ref)!.rotation ?? 0).toBe(0);
    } finally {
      await booted.destroy();
    }
  });

  it('a quarter turn at the edge of the page keeps the field on its page', async () => {
    const booted = await boot();
    try {
      const { form, annotation, interaction, widgetOf } = booted;
      interaction.activateTool('form-edit');
      await annotation.whenSynced();
      // The file's upright field: 160 wide, 24 tall, 16 below the top of its page.
      const ref = widgetOf('upright');
      expect(rounded(form.getWidget(ref)!.rect)).toEqual({ x: 20, y: 16, width: 160, height: 24 });
      annotation.selection.select([ref]);
      await annotation.selection.rotateBy(90);
      const turned = form.getWidget(ref)!;
      expect(turned.rotation).toBe(90);
      // About its middle it would stand 52 past the top edge: it lands against the edge.
      expect(rounded(turned.rect)).toEqual({ x: 88, y: 0, width: 24, height: 160 });
      // Upright again there is room, so it turns where it stands.
      await annotation.selection.resetRotation();
      expect(rounded(form.getWidget(ref)!.rect)).toEqual({ x: 20, y: 68, width: 160, height: 24 });
    } finally {
      await booted.destroy();
    }
  });

  it("Orientation turns a field's contents where it stands", async () => {
    const booted = await boot();
    try {
      const { form, annotation, interaction, widgetOf } = booted;
      interaction.activateTool('form-edit');
      await annotation.whenSynced();
      const ref = widgetOf('upright');
      const before = form.getWidget(ref)!;
      annotation.selection.select([ref]);
      // The style panel lists it for a selection of fields, as the choice's value.
      const { properties, values } = annotation.selection.getProperties();
      expect(properties.map((property) => property.key)).toContain('orientation');
      expect(values.orientation).toBe('0');
      await annotation.selection.update((widget) => orientationPatch(widget, 90));
      const turned = form.getWidget(ref)!;
      expect(turned.rotation).toBe(90);
      // It stands where it stood; its frame has its sides swapped.
      expect(rounded(turned.rect)).toEqual(rounded(before.rect));
      expect(rounded(turned.box)).toEqual(rounded(swapped(before.rect)));
      expect(annotation.selection.getProperties().values.orientation).toBe('90');
      // Without a selection, on one box.
      await form.updateWidget(ref, orientationPatch(turned, 0));
      expect(form.getWidget(ref)!.rotation ?? 0).toBe(0);
      expect(rounded(form.getWidget(ref)!.rect)).toEqual(rounded(before.rect));
    } finally {
      await booted.destroy();
    }
  });
});
