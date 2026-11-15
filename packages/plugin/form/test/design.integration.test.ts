/**
 * Form design through lending, on a real engine with the annotation plugin and the history: in
 * design mode the annotation plugin borrows the form's widgets and edits them with its own
 * tools, and each edit is the form's ops in the same change as the rest of it. A drag of two
 * fields and an annotation is one change and one undo step; a placed field shows and is selected
 * at once; a deleted field an undo brings back before the answer comes back with its picture;
 * a commenter can't select a field, and a design-only token designs.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { BANDS_PDF, CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type ChangeOp,
  type FormFieldRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { hasLiveDrawing, scene } from '@embedpdf/core-annotation';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin, InteractionToken } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { gated, type HeldChange } from './helpers/fill-form';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

/** The fixture's merged text field and widget `name`, and its square, on page 1. */
const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };

/**
 * The fixture with two signature fields on `name`'s page: `approval`, empty,
 * and `marked`, with a mark drawn in without signing.
 */
async function withSignatureFields(): Promise<Uint8Array> {
  const doc = await engine.open(
    { kind: 'bytes', id: 'signature-fields', bytes: CHANGE_FIXTURE_PDF.slice() },
    { scope: ['*'] } as never,
  );
  const name = (await doc.forms.list()).fields.find((field) => field.name === 'name')!;
  const page = name.widgets[0]!.page!;
  const look = { color: '#1a1a1a', interiorColor: '#eeeeee' };
  await doc.forms.create({
    kind: 'signature',
    name: 'approval',
    widgets: [{ page, rect: { x: 40, y: 300, width: 160, height: 50 }, ...look }],
  });
  await doc.forms.create({
    kind: 'signature',
    name: 'marked',
    widgets: [{ page, rect: { x: 40, y: 380, width: 160, height: 50 }, ...look }],
  });
  await doc.forms.setSignatureAppearance!(
    { kind: 'fqn', name: 'marked' },
    { pdf: BANDS_PDF.slice() },
  );
  const bytes = await doc.download();
  await doc.close();
  return bytes;
}

async function boot(scope?: readonly string[], bytes: Uint8Array = CHANGE_FIXTURE_PDF) {
  const held: HeldChange[] = [];
  let holding = false;
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    engine: gated(
      engine,
      held,
      (doc) => (inner = doc),
      () => holding,
    ),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open(
    { kind: 'bytes', id: `design-${Math.random()}`, bytes: bytes.slice() },
    scope ? ({ scope } as never) : undefined,
  );
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await annotation.whenSynced();
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const page = form.get(NAME)!.widgets[0]!.page as PageRef;
  const widgetOf = (field: FormFieldRef): AnnotationRef => {
    const widget = form.get(field)!.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  // A token without `doc.annotate.read` reads none.
  const square = (await doc.annotations.list().catch(() => ({ annotations: [] }))).annotations.find(
    (each) => each.subtype === 'square',
  )!;
  /** Where the engine has a widget, read fresh. */
  const truthOf = async (ref: AnnotationRef) =>
    (await doc.forms.list()).widgets.find((row) => annotationKey(row.ref) === annotationKey(ref)) ??
    null;
  return {
    kernel,
    form,
    annotation,
    interaction,
    history,
    doc,
    page,
    widgetOf,
    square,
    truthOf,
    held,
    hold: () => {
      holding = true;
    },
    /** Let every held change go to the engine, in order, and stop holding. */
    release: async () => {
      holding = false;
      while (held.length > 0) {
        const write = held.shift()!;
        await doc.apply(write.change, write.options as never).then(write.resolve, write.reject);
      }
    },
    design: () => interaction.activateTool('form-edit'),
    /** A drag on the page with the edit tool, from one point to another. */
    drag: (from: { x: number; y: number }, to: { x: number; y: number }) => {
      annotation.editPointer('down', page, from, false, 1);
      annotation.editPointer(
        'move',
        page,
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        false,
        1,
      );
      annotation.editPointer('move', page, to, false, 1);
      annotation.editPointer('up', page, to, false, 1);
    },
    destroy: () => kernel.destroy(),
  };
}

type Booted = Awaited<ReturnType<typeof boot>>;

const opsOf = (write: HeldChange): readonly ChangeOp[] =>
  'ops' in write.change ? write.change.ops : [];

const settled = (booted: Booted) =>
  new Promise<void>((done) => setTimeout(done, 20)).then(() => booted.annotation.whenSynced());

describe('design through lending', () => {
  it('the annotation plugin borrows the widgets in design mode, and only then', async () => {
    const booted = await boot();
    try {
      const { annotation, form, page, widgetOf } = booted;
      const widget = widgetOf(NAME);
      // Filling: the form layer draws and fills the widget.
      expect(annotation.get(widget)).toBeNull();
      expect(form.listShownWidgets(page)).toHaveLength(1);
      booted.design();
      expect(annotation.get(widget)?.subtype).toBe('widget');
      expect(form.listShownWidgets(page)).toHaveLength(0);
      // The annotations stay the document's own.
      expect(annotation.list().some((each) => each.subtype === 'widget')).toBe(false);
      // Back to filling: the widget leaves the annotation plugin, selection and all.
      annotation.selection.select([widget]);
      booted.interaction.activateDefaultTool();
      expect(annotation.get(widget)).toBeNull();
      expect(annotation.selection.getSelected()).toHaveLength(0);
    } finally {
      await booted.destroy();
    }
  });

  it('a placed field shows and is selected at once', async () => {
    const booted = await boot();
    try {
      const { annotation, form, page } = booted;
      booted.design();
      // The first create fills the session's pool of object numbers.
      await form.create({ kind: 'text', name: 'warm', widgets: [{ page, rect: box(200, 10) }] });
      const created = form.create({
        kind: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: box(200, 60, 18, 18) }],
      });
      const shown = form.get({ kind: 'fqn', name: 'agree' });
      expect(shown?.kind).toBe('checkbox');
      const widget = booted.widgetOf({ kind: 'fqn', name: 'agree' });
      annotation.selection.select([widget]);
      expect(annotation.selection.getSelected().map((each) => annotationKey(each.ref))).toEqual([
        annotationKey(widget),
      ]);
      // Drawn live until the engine has its picture.
      const item = annotation.listPageItems(page).find((each) => each.id === annotationKey(widget));
      expect(item).toBeDefined();
      const { field } = await created;
      expect(annotationKey(field.widgets[0]!.ref!)).toBe(annotationKey(widget));
    } finally {
      await booted.destroy();
    }
  });

  it('two fields and an annotation dragged together are one change and one undo step', async () => {
    const booted = await boot();
    try {
      const { annotation, form, history, page, square } = booted;
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(150, 100) }] });
      await settled(booted);
      booted.design();
      const name = booted.widgetOf(NAME);
      const city = booted.widgetOf({ kind: 'fqn', name: 'city' });
      const before = {
        name: (await booted.truthOf(name))!.rect,
        city: (await booted.truthOf(city))!.rect,
        square: square.rect,
      };
      annotation.selection.select([name, city, square.ref]);
      history.clear();
      booted.hold();
      booted.drag({ x: 50, y: 70 }, { x: 70, y: 80 });
      expect(booted.held).toHaveLength(1);
      expect(
        opsOf(booted.held[0]!)
          .map((op) => op.type)
          .sort(),
      ).toEqual(['annotations.update', 'forms.updateWidget', 'forms.updateWidget']);
      // Every part shows moved before the engine answers.
      expect(annotation.get(name)!.rect.x).toBeCloseTo(before.name.x + 20);
      expect(annotation.get(city)!.rect.y).toBeCloseTo(before.city.y + 10);
      await booted.release();
      await settled(booted);
      expect((await booted.truthOf(name))!.rect.x).toBeCloseTo(before.name.x + 20);
      expect((await booted.truthOf(city))!.rect.y).toBeCloseTo(before.city.y + 10);

      const undone = new Promise<void>((done) => {
        const off = history.onUndone(() => {
          off();
          done();
        });
      });
      expect(history.canUndo()).toBe(true);
      history.undo();
      // One step takes all three back, at once.
      expect(annotation.get(name)!.rect.x).toBeCloseTo(before.name.x);
      expect(annotation.get(square.ref)!.rect.x).toBeCloseTo(before.square.x);
      await undone;
      await settled(booted);
      expect((await booted.truthOf(name))!.rect.x).toBeCloseTo(before.name.x);
      expect((await booted.truthOf(city))!.rect.y).toBeCloseTo(before.city.y);
      expect(history.canUndo()).toBe(false);
    } finally {
      await booted.destroy();
    }
  });

  it('a deleted field an undo brings back before the answer comes back with its picture', async () => {
    const booted = await boot();
    try {
      const { annotation, form, history, page } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      // Its picture, as the page draws it now.
      const pictures = await annotation.renderAppearances(page, 1);
      expect(pictures.some((each) => annotationKey(each.ref) === annotationKey(widget))).toBe(true);
      annotation.selection.select([widget]);
      history.clear();
      booted.hold();
      const field = form.get(NAME)!.ref;
      void annotation.selection.delete().catch(() => undefined);
      expect(booted.held.map(opsOf)).toEqual([[{ type: 'forms.delete', field }]]);
      expect(form.get(NAME)).toBeNull();
      expect(annotation.get(widget)).toBeNull();
      history.undo();
      // Back at once, drawn from the picture it had.
      expect(form.get(NAME)).not.toBeNull();
      expect(annotation.get(widget)).not.toBeNull();
      const back = await annotation.renderAppearances(page, 1);
      expect(back.some((each) => annotationKey(each.ref) === annotationKey(widget))).toBe(true);
      await booted.release();
      await settled(booted);
      expect(await booted.truthOf(widget)).not.toBeNull();
    } finally {
      await booted.destroy();
    }
  });

  it("a render one view cancels leaves the next one the widgets' pictures", async () => {
    const booted = await boot();
    try {
      const { annotation, page } = booted;
      booted.design();
      const widget = annotationKey(booted.widgetOf(NAME));
      const cancel = new AbortController();
      const cancelled = annotation.renderAppearances(page, 1, cancel.signal);
      cancel.abort();
      const next = await annotation.renderAppearances(page, 1);
      expect(next.some((each) => annotationKey(each.ref) === widget)).toBe(true);
      await cancelled.catch(() => undefined);
    } finally {
      await booted.destroy();
    }
  });

  it("a widget's change stated in code is the form's, and a reorder of widgets is the form's in the same change", async () => {
    const booted = await boot();
    try {
      const { annotation, page } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      await expect(
        annotation.update(widget, { subtype: 'widget', color: '#ff0000' } as never),
      ).rejects.toMatchObject({ message: expect.stringContaining('form plugin') });
      booted.hold();
      void annotation.reorder([widget], 'start').catch(() => undefined);
      expect(booted.held.map(opsOf)).toEqual([
        [{ type: 'forms.reorderWidgets', page, widgets: [widget], position: 'start' }],
      ]);
      await booted.release();
    } finally {
      await booted.destroy();
    }
  });

  it("a widget is the form's to copy: `duplicate()` refuses one, in design mode and out of it", async () => {
    const booted = await boot();
    try {
      const { annotation } = booted;
      const widget = booted.widgetOf(NAME);
      // Filling: a widget isn't one of the annotation plugin's records.
      expect(annotation.canDuplicate([widget])).toBe(false);
      await expect(annotation.duplicate([widget])).rejects.toMatchObject({ code: 'not-found' });
      booted.design();
      const before = annotation.list().length;
      expect(annotation.canDuplicate([widget])).toBe(false);
      await expect(annotation.duplicate([widget])).rejects.toMatchObject({
        code: 'invalid-input',
        message: expect.stringContaining('form plugin'),
      });
      expect(annotation.list()).toHaveLength(before);
    } finally {
      await booted.destroy();
    }
  });

  it("describes a field's settings, and a change to one shows at once", async () => {
    const booted = await boot();
    try {
      const { form } = booted;
      const settings = form.getFieldSettings(NAME)!;
      expect(settings.properties.map((each) => each.key)).toEqual([
        'name',
        'alternateName',
        'required',
        'readOnly',
        'noExport',
        'defaultValue',
        'maxLength',
        'multiline',
        'password',
        'comb',
      ]);
      // Each label has its translation key, as a panel reads it.
      for (const setting of settings.properties) {
        expect(setting.labelKey).toMatch(/^form\.settings\.[a-zA-Z]+$/);
      }
      expect(settings.values).toMatchObject({ name: 'name', required: false, maxLength: null });
      const written = form.update(NAME, { required: true, maxLength: 8 });
      expect(form.getFieldSettings(NAME)!.values).toMatchObject({ required: true, maxLength: 8 });
      await written;
      // A widget's look is the form's too.
      const widget = booted.widgetOf(NAME);
      const restyled = form.updateWidget(widget, { color: '#ff0000' });
      expect(form.getWidget(widget)?.color).toBe('#ff0000');
      expect((await restyled).widget.color).toBe('#ff0000');
    } finally {
      await booted.destroy();
    }
  });

  it('a restyled field draws live, by the painter, until the engine has drawn it again', async () => {
    const booted = await boot();
    try {
      const { annotation, form, page } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      const itemOf = () =>
        annotation
          .listPageItems(page)
          .find((item) => item.ref && annotationKey(item.ref) === annotationKey(widget))!;
      expect(itemOf().source).toBe('baked');
      const version = itemOf().pictureVersion;

      booted.hold();
      void form
        .updateWidget(widget, { color: '#ff0000', borderStyle: 'dashed', strokeWidth: 3 })
        .catch(() => {});
      // At once, drawn by the form's painter: a red dashed border, 3 points wide.
      const live = itemOf();
      expect(live.source).toBe('vector');
      expect(
        scene(live).some(
          (node) =>
            node.paint.stroke === '#ff0000' &&
            node.paint.dash !== undefined &&
            node.paint.width === 3,
        ),
      ).toBe(true);

      await booted.release();
      await settled(booted);
      // Confirmed: drawn by the engine again, at a new picture version. Until that picture
      // arrives, the painter can still draw it.
      const confirmed = itemOf();
      expect(confirmed.source).toBe('baked');
      expect(confirmed.pictureVersion).toBeGreaterThan(version ?? 0);
      expect(hasLiveDrawing(confirmed)).toBe(true);
    } finally {
      await booted.destroy();
    }
  });

  it('a restyled signature field draws its box live, and one with a mark in it has no style', async () => {
    const booted = await boot(undefined, await withSignatureFields());
    try {
      const { annotation, form, page } = booted;
      booted.design();
      const itemOf = (ref: AnnotationRef) =>
        annotation
          .listPageItems(page)
          .find((item) => item.ref && annotationKey(item.ref) === annotationKey(ref))!;
      const empty = booted.widgetOf({ kind: 'fqn', name: 'approval' });
      expect(itemOf(empty)).toMatchObject({ subtype: 'widget-box', source: 'baked' });

      booted.hold();
      void form.updateWidget(empty, { interiorColor: '#d43c2c' }).catch(() => {});
      // At once, drawn by the form's painter: its box, in the new background.
      const live = itemOf(empty);
      expect(live.source).toBe('vector');
      expect(scene(live).some((node) => node.paint.fill === '#d43c2c')).toBe(true);
      await booted.release();
      await settled(booted);
      // Confirmed: the engine has drawn the box again.
      expect(itemOf(empty).source).toBe('baked');
      expect(await booted.truthOf(empty)).toMatchObject({
        interiorColor: '#d43c2c',
        hasAppearance: true,
        hasMark: false,
      });

      // With a mark in it: no style to change, and only its picture draws it.
      const marked = itemOf(booted.widgetOf({ kind: 'fqn', name: 'marked' }));
      expect(marked).toMatchObject({ subtype: 'widget-mark', source: 'baked' });
      expect(hasLiveDrawing(marked)).toBe(false);
    } finally {
      await booted.destroy();
    }
  });

  it('a field being resized draws live, by the painter, at the size the drag has, from the first drag', async () => {
    const booted = await boot();
    try {
      const { annotation, page } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      const itemOf = () =>
        annotation
          .listPageItems(page)
          .find((item) => item.ref && annotationKey(item.ref) === annotationKey(widget))!;
      const before = itemOf();
      expect(before.source).toBe('baked');
      annotation.selection.select([widget]);
      // The south-east handle, on the box's corner, dragged 40 points right and 10 down.
      const corner = { x: before.box.x + before.box.width, y: before.box.y + before.box.height };
      annotation.editPointer('down', page, corner, false, 1);
      annotation.editPointer('move', page, { x: corner.x + 40, y: corner.y + 10 }, false, 1);

      const dragging = itemOf();
      expect(dragging.source).toBe('vector');
      expect(dragging.box.width).toBeCloseTo(before.box.width + 40, 3);
      // The painter laid its text out in the dragged box: clipped to its right edge.
      const text = scene(dragging).find((node) => node.kind === 'textRun');
      expect(text?.clip).toBeDefined();
      expect(text!.clip!.x + text!.clip!.width).toBeCloseTo(
        dragging.box.x +
          dragging.box.width -
          (dragging.annotation as { strokeWidth: number }).strokeWidth,
        3,
      );
      annotation.editPointer('up', page, { x: corner.x + 40, y: corner.y + 10 }, false, 1);
      await settled(booted);
    } finally {
      await booted.destroy();
    }
  });

  it("a commenter can't select a field", async () => {
    const booted = await boot([
      'doc.open',
      'doc.render',
      'doc.annotate.read',
      'annotations:create:all',
      'doc.forms.read',
      'doc.forms.fill',
    ]);
    try {
      const { annotation } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      expect(annotation.get(widget)).toBeNull();
      annotation.selection.select([widget]);
      expect(annotation.selection.getSelected()).toHaveLength(0);
      // Nothing is lent, so the form layer keeps drawing the field.
      expect(booted.form.listShownWidgets(booted.page)).toHaveLength(1);
    } finally {
      await booted.destroy();
    }
  });

  it('a design-only token designs', async () => {
    const booted = await boot(['doc.open', 'doc.render', 'doc.forms.read', 'doc.forms.modify']);
    try {
      const { annotation } = booted;
      booted.design();
      const widget = booted.widgetOf(NAME);
      const before = (await booted.truthOf(widget))!.rect;
      annotation.selection.select([widget]);
      booted.drag({ x: before.x + 10, y: before.y + 10 }, { x: before.x + 40, y: before.y + 10 });
      const shown = annotation.get(widget)!.rect;
      // Moved right (alignment guides may snap it a little further).
      expect(shown.x).toBeGreaterThan(before.x + 20);
      await settled(booted);
      expect((await booted.truthOf(widget))!.rect).toEqual(shown);
    } finally {
      await booted.destroy();
    }
  });
});

function box(x: number, y: number, width = 120, height = 20) {
  return { x, y, width, height };
}
