/**
 * Image fields on a real engine: a push button's box that shows its image alone and does nothing
 * of its own is an image box (`control: 'image'`), whatever the field is called; any action but
 * Acrobat's import-icon script keeps it a button. `setButtonImage()` puts a picture in as one
 * change, gated by the right to fill the field in; an empty one is empty, a required one is on
 * `validate()`'s list, and `prefill()` leaves it. The two tools place one, `addWidget()` copies
 * its layout, and a picture anyone put in is locked by the next signature.
 */
import { createKernel, timerClock, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import {
  ANYONE_FIELDS_PDF,
  ANYONE_FIELD_TOKENS,
  BANDS_PNG,
  PICTURE_BUTTON_PDF,
} from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type Change,
  type ChangeOp,
  type FormField,
  type FormFieldRef,
  type PageRef,
  type WidgetActionsPatch,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const EVERYTHING = { scope: ['*'], identity: {} };

/** A signature's bytes: the engine stores them and judges nothing by them. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

interface Session {
  readonly scope: readonly string[];
  readonly identity: Record<string, string>;
}

/** The engine, with every change this session sends written down before it goes on. */
function recording(inner: Engine, sent: ChangeOp[][], opened: (doc: DocumentHandle) => void) {
  const record = (doc: DocumentHandle): DocumentHandle =>
    new Proxy(doc, {
      get(target, prop) {
        if (prop === 'apply') {
          return (change: Change, options: unknown) => {
            if ('ops' in change) sent.push([...change.ops]);
            return target.apply(change, options as never);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'with' && typeof value === 'function') {
          return (...args: unknown[]) => record(value.apply(target, args) as DocumentHandle);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'open') {
        return async (...args: Parameters<Engine['open']>) => {
          const doc = await target.open(...args);
          opened(doc);
          return record(doc);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Engine;
}

async function boot(bytes: Uint8Array, session: Session = EVERYTHING) {
  const sent: ChangeOp[][] = [];
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    clock: { ...timerClock, today: () => ({ year: 2026, month: 11, day: 27 }) },
    engine: recording(engine, sent, (doc) => (inner = doc)),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: `images-${Math.random()}`, bytes }, {
    scope: [...session.scope, 'doc.forms.read'],
    identity: session.identity,
  } as never);
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await annotation.whenSynced();
  const page = (await doc.pages.list()).pages[0]!.ref as PageRef;
  await form.ensureLoaded(page);
  const boxOf = (name: string) =>
    form.listWidgets(page).find((item) => form.get(item.fieldRef)?.name === name);
  const pointer = (phase: 'move' | 'down' | 'up', point: { x: number; y: number }) =>
    interaction.dispatchPointer({
      phase,
      viewport: { x: 0, y: 0 },
      page: { ref: page, point },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    });
  const place = async (tool: string, point: { x: number; y: number }): Promise<FormField> => {
    const before = new Set(form.list().map((field) => field.name));
    interaction.activateTool(tool);
    pointer('down', point);
    pointer('up', point);
    let placed: FormField | undefined;
    await vi.waitFor(async () => {
      placed = (await doc.forms.list()).fields.find((field) => !before.has(field.name));
      expect(placed).toBeDefined();
    });
    await vi.waitFor(() => expect(form.get(placed!.ref)).not.toBeNull());
    return form.get(placed!.ref)!;
  };
  const undo = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const offDone = history.onUndone(() => {
        offDone();
        offFailed();
        resolve();
      });
      const offFailed = history.onUndoFailed((event) => {
        offDone();
        offFailed();
        reject(new Error(`undo failed: ${JSON.stringify(event)}`));
      });
      history.undo();
    });
  return {
    kernel,
    doc,
    form,
    annotation,
    interaction,
    page,
    sent,
    boxOf,
    pointer,
    place,
    undo,
    destroy: () => kernel.destroy(),
  };
}

/** What a call rejects with: its code and, for a refusal, the permission it names. */
const refusalOf = (attempt: Promise<unknown>) =>
  attempt.then(
    () => 'resolved',
    (error: { code?: string; permission?: string }) =>
      error.permission ? { code: error.code, permission: error.permission } : error.code,
  );

/** `bytes` after `write` ran on a document opened with everything. */
async function authored(
  bytes: Uint8Array,
  write: (doc: DocumentHandle, page: PageRef) => Promise<void>,
): Promise<Uint8Array> {
  const doc = await engine.open(
    { kind: 'bytes', id: `author-${Math.random()}`, bytes: bytes.slice() },
    { scope: ['*'] },
  );
  const page = (await doc.pages.list()).pages[0]!.ref;
  await write(doc, page);
  const out = await doc.download();
  await doc.close();
  return out;
}

/** The first box of a field, as an annotation ref. */
async function boxRefOf(doc: DocumentHandle, name: string): Promise<AnnotationRef> {
  const field = (await doc.forms.get(ref(name))) as FormField;
  const widget = field.widgets[0]!;
  return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
}

/** Acrobat's image field press. */
const IMPORT_ICON: WidgetActionsPatch = {
  activate: { type: 'javascript', script: 'event.target.buttonImportIcon();' },
};

describe('which box is an image box', () => {
  it('shows its image alone and does nothing of its own; any other action keeps it a button', async () => {
    const bytes = await authored(PICTURE_BUTTON_PDF, async (doc, page) => {
      // Acrobat's own press on an image field: still an image box.
      await doc.forms.updateWidget(await boxRefOf(doc, 'buyer_initials'), {
        actions: IMPORT_ICON,
      });
      // The same script on mouse-up: still an image box.
      await doc.forms.updateWidget(await boxRefOf(doc, 'acrobat_image'), {
        actions: { mouseUp: IMPORT_ICON.activate },
      });
      // An icon-only print button: a button.
      await doc.forms.updateWidget(await boxRefOf(doc, 'seller_initials'), {
        actions: { activate: { type: 'named', name: 'Print' } },
      });
      // The script and something more on another event: a button.
      await doc.forms.updateWidget(await boxRefOf(doc, 'layout_1'), {
        actions: { ...IMPORT_ICON, cursorEnter: { type: 'named', name: 'NextPage' } },
      });
      // Named like Acrobat's image fields, with a caption: a button.
      await doc.forms.create({
        kind: 'pushbutton',
        name: '_af_image',
        widgets: [{ page, rect: { x: 300, y: 40, width: 90, height: 30 }, caption: 'Go' }],
      });
    });
    const sender = await boot(bytes);
    try {
      const controls = Object.fromEntries(
        [
          'acrobat_image',
          'buyer_initials',
          'seller_initials',
          'layout_1',
          'layout_0',
          'layout_none',
          '_af_image',
        ].map((name) => [name, sender.boxOf(name)?.control]),
      );
      expect(controls).toEqual({
        acrobat_image: 'image',
        buyer_initials: 'image',
        seller_initials: 'button',
        layout_1: 'button',
        layout_0: 'button',
        layout_none: 'button',
        _af_image: 'button',
      });
      // The standard's image field holds its icon; the fixture's initials hold none yet.
      expect(sender.boxOf('acrobat_image')).toMatchObject({ hasImage: true, empty: false });
      expect(sender.boxOf('buyer_initials')).toMatchObject({ hasImage: false, empty: true });
      // A button holds no value: never empty, never yours.
      expect(sender.boxOf('layout_0')).toMatchObject({ empty: false, yours: false });
    } finally {
      await sender.destroy();
    }
  });

  it('`getWidgetAt()` says so of the box under the point', async () => {
    const bytes = await authored(PICTURE_BUTTON_PDF, async (doc, page) => {
      // An icon-only button that resets the form.
      await doc.forms.create({
        kind: 'pushbutton',
        name: 'reset_icon',
        widgets: [
          {
            page,
            rect: { x: 300, y: 40, width: 36, height: 24 },
            layout: 'image',
            actions: { activate: { type: 'reset-form', fields: null, exclude: false } },
          },
        ],
      });
    });
    const sender = await boot(bytes);
    try {
      const hitOn = (name: string) => {
        const { rect } = sender.boxOf(name)!;
        const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        return sender.form.getWidgetAt(sender.page, middle);
      };
      expect(hitOn('buyer_initials')).toMatchObject({
        field: { name: 'buyer_initials' },
        imageBox: true,
      });
      expect(hitOn('reset_icon')).toMatchObject({ field: { name: 'reset_icon' }, imageBox: false });
      expect(sender.boxOf('reset_icon')?.control).toBe('button');
    } finally {
      await sender.destroy();
    }
  });
});

describe('a picture in an image field', () => {
  it('goes in as one change and one step to undo, said at once and drawn once the engine answers', async () => {
    const filler = await boot(PICTURE_BUTTON_PDF, PICTURE_BUTTON_TOKENS_FILLER);
    try {
      const { form, sent } = filler;
      expect(filler.boxOf('buyer_initials')).toMatchObject({ yours: true, empty: true });
      const before = sent.length;
      const written = form.setButtonImage(ref('buyer_initials'), { source: BANDS_PNG });
      // The resolve reads the bytes first; the box says it holds a picture as soon as it's sent.
      await vi.waitFor(() =>
        expect(filler.boxOf('buyer_initials')).toMatchObject({ hasImage: true, empty: false }),
      );
      const { field } = await written;
      expect(field).toMatchObject({ kind: 'pushbutton', hasImage: true });
      expect(sent.length - before).toBe(1);
      expect(sent.at(-1)!).toEqual([
        { type: 'forms.setButtonImage', field: field.ref, image: expect.any(Uint8Array) },
      ]);
      // One step back takes it out.
      await filler.undo();
      await vi.waitFor(() =>
        expect(filler.boxOf('buyer_initials')).toMatchObject({ hasImage: false, empty: true }),
      );
      // `null` takes a picture out.
      await form.setButtonImage(ref('acrobat_image'), null);
      expect(form.get(ref('acrobat_image'))).toMatchObject({ hasImage: false });
    } finally {
      await filler.destroy();
    }
  });

  it('is filling in: refused for a field the session may not fill in, and for a field that is no push button', async () => {
    const buyer = await boot(PICTURE_BUTTON_PDF, BUYER);
    try {
      const { form } = buyer;
      expect(form.canFill(ref('buyer_initials'))).toBe(true);
      expect(form.canFill(ref('seller_initials'))).toBe(false);
      await form.setButtonImage(ref('buyer_initials'), { source: BANDS_PNG });
      expect(form.get(ref('buyer_initials'))).toMatchObject({ hasImage: true });
      expect(
        await refusalOf(form.setButtonImage(ref('seller_initials'), { source: BANDS_PNG })),
      ).toEqual({ code: 'permission-denied', permission: 'fields:fill:group=seller' });
      // Another signer's image field is theirs: as the PDF has it.
      expect(buyer.boxOf('seller_initials')).toMatchObject({ yours: false, accent: null });
    } finally {
      await buyer.destroy();
    }
    const everything = await boot(PICTURE_BUTTON_PDF);
    try {
      expect(
        await refusalOf(everything.form.setButtonImage(ref('text_field'), { source: BANDS_PNG })),
      ).toBe('invalid-input');
    } finally {
      await everything.destroy();
    }
  });

  it('a required empty one is still to fill in, until it holds a picture; prefill() leaves it', async () => {
    const bytes = await authored(PICTURE_BUTTON_PDF, async (doc) => {
      await doc.forms.update(ref('buyer_initials'), { required: true, purpose: 'initials' });
    });
    const buyer = await boot(bytes, BUYER);
    try {
      const { form } = buyer;
      const missing = () => form.validate().missing.map((field) => field.name);
      expect(missing()).toEqual(['buyer_initials']);
      expect(buyer.boxOf('buyer_initials')).toMatchObject({
        required: true,
        placeholder: 'Initials',
      });
      // No identity value is a picture: it is neither written nor listed.
      const prefilled = await form.prefill();
      expect(prefilled.applied).toEqual([]);
      expect(prefilled.skipped).toEqual([]);
      await form.setButtonImage(ref('buyer_initials'), { source: BANDS_PNG });
      expect(missing()).toEqual([]);
      expect(buyer.boxOf('buyer_initials')).toMatchObject({ placeholder: null, empty: false });
    } finally {
      await buyer.destroy();
    }
  });

  it('anyone fills one in, and the first signature locks it', async () => {
    const bytes = await authored(ANYONE_FIELDS_PDF, async (doc, page) => {
      await doc.forms.create({
        kind: 'pushbutton',
        name: 'anyone_initials',
        assignment: { kind: 'anyone' },
        widgets: [{ page, rect: { x: 200, y: 200, width: 72, height: 36 }, layout: 'image' }],
      });
    });
    // Dana puts her initials in and signs.
    const dana = await engine.open(
      { kind: 'bytes', id: `dana-${Math.random()}`, bytes: bytes.slice() },
      { ...ANYONE_FIELD_TOKENS.dana, scope: [...ANYONE_FIELD_TOKENS.dana.scope] } as never,
    );
    await dana.forms.setButtonImage(ref('anyone_initials'), BANDS_PNG);
    const prepared = await dana.signatures.prepare({ field: ref('dana_sig') });
    await dana.signatures.complete({
      signingId: prepared.signingId,
      cms: PLACEHOLDER_CMS,
      expectedVersion: prepared.expectedVersion,
    });
    const signed = await dana.download();
    await dana.close();
    const ada = await boot(signed, {
      scope: [...ANYONE_FIELD_TOKENS.ada.scope],
      identity: ANYONE_FIELD_TOKENS.ada.identity,
    });
    try {
      expect(ada.form.get(ref('anyone_initials'))).toMatchObject({
        hasImage: true,
        readOnly: true,
      });
      expect(ada.boxOf('anyone_initials')).toMatchObject({
        control: 'image',
        yours: false,
        accent: null,
        disabled: true,
      });
    } finally {
      await ada.destroy();
    }
  });
});

describe('placing an image field', () => {
  it('the two tools place one, shown before the click; addWidget() keeps its layout', async () => {
    const sender = await boot(PICTURE_BUTTON_PDF);
    try {
      const { form, annotation, interaction, page } = sender;
      // Before the click: the box it places, see-through, with what it's for.
      interaction.activateTool('form-initials');
      sender.pointer('move', { x: 420, y: 400 });
      const ghost = annotation.listPageItems(page).find((item) => item.source === 'ghost');
      expect(ghost).toMatchObject({ placeholder: { text: 'Initials' }, ghostOpacity: 0.5 });

      const initials = await sender.place('form-initials', { x: 420, y: 400 });
      expect(initials).toMatchObject({ kind: 'pushbutton', purpose: 'initials', hasImage: false });
      const row = form.getWidget({
        kind: 'objectNumber',
        page: initials.widgets[0]!.page!,
        objectNumber: initials.widgets[0]!.objectNumber,
      });
      expect(row).toMatchObject({ layout: 'image', caption: null });
      const lent = annotation.listPageItems(page).find(
        (item) =>
          item.id ===
          annotationKey({
            kind: 'objectNumber',
            page: initials.widgets[0]!.page!,
            objectNumber: initials.widgets[0]!.objectNumber,
          }),
      );
      expect(lent?.placeholder).toMatchObject({ text: 'Initials' });

      const image = await sender.place('form-image', { x: 420, y: 520 });
      expect(image).toMatchObject({ kind: 'pushbutton', purpose: null });

      // One more place shows the same picture, as an image box too.
      const { widget } = await form.addWidget(initials.ref);
      expect(widget).toMatchObject({ layout: 'image' });

      interaction.activateTool('pointer');
      await vi.waitFor(() =>
        expect(
          form
            .listWidgets(page)
            .filter((item) => item.fieldRef && form.get(item.fieldRef)?.name === initials.name)
            .map((item) => item.control),
        ).toEqual(['image', 'image']),
      );
      expect(sender.boxOf(initials.name)).toMatchObject({ placeholder: 'Initials', yours: true });
      expect(sender.boxOf(image.name)).toMatchObject({ control: 'image', placeholder: null });
    } finally {
      await sender.destroy();
    }
  });
});

const PICTURE_BUTTON_TOKENS_FILLER: Session = {
  scope: ['doc.open', 'doc.render', 'doc.forms.fill'],
  identity: {},
};
const BUYER: Session = {
  scope: ['doc.open', 'doc.render', 'fields:fill:group=buyer', 'fields:sign:group=buyer'],
  identity: { userId: 'alice', displayName: 'Alice' },
};
