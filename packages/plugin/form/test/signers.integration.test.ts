/**
 * Fields for several people, on a real engine with the annotation plugin and the history: the app
 * names each document's groups; a sender picks who the next fields are for and places them with a
 * tool, or moves the selected fields to a signer in one step; in design mode every field in a
 * group carries its group's color as its accent; a signer who opens the saved file sees their
 * own fields in their color and other people's as the PDF has them; and no color is written
 * into the PDF.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type FormField,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormConfig, FormGroupInput } from '../src/contract';
import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { gated } from './helpers/fill-form';
import { GROUP_COLORS } from '../src/services/groups';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

const SIGNERS: readonly FormGroupInput[] = [
  { id: 'buyer', label: 'Dana Smith', color: '#2563eb' },
  { id: 'seller', label: 'Lanternfield' },
];
/** The seller is second in the list and has no color of its own: it gets the second of the eight. */
const SELLER_COLOR = GROUP_COLORS[1]!;

/** A sender who designs the form and places fields for the buyer and the seller, and no one else. */
const SENDER = [
  'doc.open',
  'doc.render',
  'doc.download',
  'doc.annotate.read',
  'doc.forms.read',
  'doc.forms.fill',
  'doc.forms.modify',
  'fields:set-group:group=buyer',
  'fields:set-group:group=seller',
];

/** The buyer: fills in and signs the buyer's fields. */
const BUYER = [
  'doc.open',
  'doc.render',
  'doc.forms.read',
  'fields:fill:group=buyer',
  'fields:sign:group=buyer',
  'doc.sign',
];

async function boot(
  scope: readonly string[],
  bytes: Uint8Array,
  groups: readonly FormGroupInput[] | null = SIGNERS,
  config: FormConfig = {},
) {
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    // The engine's own handle, for reading what the file holds; nothing is held back.
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
      formPlugin(config),
      historyPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: `signers-${Math.random()}`, bytes }, {
    scope,
  } as never);
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  // The app tells the document who its groups are.
  if (groups) form.setGroups(groups);
  await form.refresh();
  await annotation.whenSynced();
  const page = (await doc.pages.list()).pages[0]!.ref as PageRef;
  await form.ensureLoaded(page);
  const widgetOf = (field: FormField): AnnotationRef => {
    const widget = field.widgets[0]!;
    return { kind: 'objectNumber', page: widget.page!, objectNumber: widget.objectNumber };
  };
  /** A click on the page with a field tool, and the field it placed once the engine answered. */
  const place = async (tool: string, point: { x: number; y: number }): Promise<FormField> => {
    const before = new Set(form.list().map((field) => field.name));
    interaction.activateTool(tool);
    const sample = (phase: 'down' | 'up') => ({
      phase,
      viewport: { x: 0, y: 0 },
      page: { ref: page, point },
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    });
    interaction.dispatchPointer(sample('down'));
    interaction.dispatchPointer(sample('up'));
    let placed: FormField | undefined;
    await vi.waitFor(async () => {
      const read = (await doc.forms.list()).fields.find((field) => !before.has(field.name));
      expect(read).toBeDefined();
      placed = read;
    });
    await vi.waitFor(() => expect(form.get(placed!.ref)).not.toBeNull());
    return form.get(placed!.ref)!;
  };
  /** The accent the annotation layer draws a lent field with, or `null`. */
  const accentOf = (field: FormField) =>
    annotation.listPageItems(page).find((item) => item.id === annotationKey(widgetOf(field)))
      ?.accent ?? null;
  /** Each field's group as the engine holds it now. */
  const truth = async () =>
    Object.fromEntries((await doc.forms.list()).fields.map((field) => [field.name, field.groupId]));
  return {
    kernel,
    doc,
    form,
    annotation,
    interaction,
    history,
    page,
    widgetOf,
    place,
    accentOf,
    truth,
    destroy: () => kernel.destroy(),
  };
}

describe('fields for several people, on a real engine', () => {
  it('a sender places fields for two signers, and each shows in its signer’s color', async () => {
    const sender = await boot(SENDER, CHANGE_FIXTURE_PDF.slice());
    const { form } = sender;
    try {
      expect(form.canSetGroup('buyer')).toBe(true);
      expect(form.canSetGroup('seller')).toBe(true);
      expect(form.canSetGroup('witness')).toBe(false);
      expect(() => form.setDesignGroup('witness')).toThrowError(/fields:set-group:group=witness/);

      form.setDesignGroup('buyer');
      const hers = await sender.place('form-text', { x: 120, y: 300 });
      form.setDesignGroup('seller');
      const theirs = await sender.place('form-text', { x: 120, y: 360 });
      form.setDesignGroup(null);
      const own = await sender.place('form-checkbox', { x: 120, y: 420 });
      expect([hers.groupId, theirs.groupId, own.groupId]).toEqual(['buyer', 'seller', null]);

      // Design mode: the fields are lent to the annotation plugin, each with its group's color.
      sender.interaction.activateTool('form-edit');
      expect(sender.accentOf(hers)).toEqual({ color: '#2563eb', strength: 0.16 });
      expect(sender.accentOf(theirs)).toEqual({ color: SELLER_COLOR, strength: 0.16 });
      expect(sender.accentOf(own)).toBeNull();

      // The strength follows the setting while the app runs, and the colors the groups.
      form.updateSettings({ fields: { tint: 0.4 } });
      expect(sender.accentOf(hers)).toEqual({ color: '#2563eb', strength: 0.4 });
      // A group the app no longer names still shows: second in the list now, after the seller.
      form.setGroups([{ id: 'seller', color: 'var(--signer-2)' }]);
      expect(form.listGroups().map((group) => group.id)).toEqual(['seller', 'buyer']);
      expect(sender.accentOf(hers)).toEqual({ color: GROUP_COLORS[1], strength: 0.4 });
      expect(sender.accentOf(theirs)).toEqual({ color: 'var(--signer-2)', strength: 0.4 });
      // At 0 no field shows its group.
      form.updateSettings({ fields: { tint: 0 } });
      expect(sender.accentOf(hers)).toBeNull();
      expect(sender.accentOf(theirs)).toBeNull();
      form.setGroups(SIGNERS);
      form.updateSettings({ fields: { tint: 0.16 } });

      // A field moved to another group shows in that group's color.
      const moved = (await form.update(hers.ref, { groupId: 'seller' })).field;
      expect(moved.groupId).toBe('seller');
      expect(sender.accentOf(moved)).toEqual({ color: SELLER_COLOR, strength: 0.16 });
      await form.update(hers.ref, { groupId: 'buyer' });
      expect(sender.accentOf(form.get(hers.ref)!)).toEqual({ color: '#2563eb', strength: 0.16 });

      // The colors are the layer's paint: the widget in the file keeps the tool's own look.
      const row = (await sender.doc.forms.list()).widgets.find(
        (widget) => annotationKey(widget.ref) === annotationKey(sender.widgetOf(hers)),
      )!;
      expect(row).toMatchObject({ color: '#6b7280', interiorColor: '#ffffff' });
    } finally {
      await sender.destroy();
    }
  });

  it('the selected fields move to a signer in one step, and one undo puts them back', async () => {
    const sender = await boot(SENDER, CHANGE_FIXTURE_PDF.slice());
    const { form, annotation, history } = sender;
    try {
      // Two fields in no group, as a form made elsewhere has them, and one of the seller's.
      const first = await sender.place('form-text', { x: 120, y: 300 });
      const second = await sender.place('form-text', { x: 120, y: 360 });
      form.setDesignGroup('seller');
      const third = await sender.place('form-text', { x: 120, y: 420 });
      expect([first.groupId, second.groupId, third.groupId]).toEqual([null, null, 'seller']);

      sender.interaction.activateTool('form-edit');
      // The field placed last is still selected.
      expect(form.listSelectedFields().map((field) => field.name)).toEqual([third.name]);
      annotation.selection.select([]);
      expect(form.listSelectedFields()).toEqual([]);
      annotation.selection.select([sender.widgetOf(second), sender.widgetOf(first)]);
      // One field is the selected field; several are the selected fields, in the selection's order.
      expect(form.getSelectedField()).toBeNull();
      expect(form.listSelectedFields().map((field) => field.name)).toEqual([
        second.name,
        first.name,
      ]);
      expect(form.listSelectedFields()).toBe(form.listSelectedFields());

      history.clear();
      const { fields } = await form.moveToGroup(
        form.listSelectedFields().map((field) => field.ref),
        'buyer',
      );
      expect(fields.map((field) => [field.name, field.groupId])).toEqual([
        [second.name, 'buyer'],
        [first.name, 'buyer'],
      ]);
      expect(await sender.truth()).toMatchObject({
        [first.name]: 'buyer',
        [second.name]: 'buyer',
        [third.name]: 'seller',
      });
      expect(sender.accentOf(form.get(first.ref)!)).toEqual({ color: '#2563eb', strength: 0.16 });

      // One step: a single undo returns both to no group.
      history.undo();
      await vi.waitFor(async () =>
        expect(await sender.truth()).toMatchObject({ [first.name]: null, [second.name]: null }),
      );
      await vi.waitFor(() => expect(form.get(first.ref)!.groupId).toBeNull());
      expect(form.get(second.ref)!.groupId).toBeNull();
      expect(history.canUndo()).toBe(false);
      expect(sender.accentOf(form.get(first.ref)!)).toBeNull();

      // Out of every group again, by a sender whose rights name two groups only: it takes
      // form design alone, and it is one step too.
      await form.moveToGroup([first.ref, second.ref], 'seller');
      history.clear();
      const freed = await form.moveToGroup([first.ref, second.ref, third.ref], null);
      expect(freed.fields.map((field) => field.groupId)).toEqual([null, null, null]);
      expect(await sender.truth()).toMatchObject({
        [first.name]: null,
        [second.name]: null,
        [third.name]: null,
      });
      expect(form.listGroups().map((group) => group.id)).toEqual(['buyer', 'seller']);
      history.undo();
      await vi.waitFor(async () =>
        expect(await sender.truth()).toMatchObject({
          [first.name]: 'seller',
          [second.name]: 'seller',
          [third.name]: 'seller',
        }),
      );
      await vi.waitFor(() => expect(form.get(first.ref)!.groupId).toBe('seller'));
      await form.moveToGroup([first.ref, second.ref], null);

      // A group the sender may not place for is refused, and nothing moves.
      await expect(form.moveToGroup([first.ref], 'witness')).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'fields:set-group:group=witness',
      });
      expect((await sender.truth())[first.name]).toBeNull();
    } finally {
      await sender.destroy();
    }
  });

  it('a signer sees their own fields in their color, and whose each field is', async () => {
    const sender = await boot(SENDER, CHANGE_FIXTURE_PDF.slice());
    sender.form.setDesignGroup('buyer');
    await sender.place('form-text', { x: 120, y: 300 });
    sender.form.setDesignGroup('seller');
    await sender.place('form-text', { x: 120, y: 360 });
    const bytes = await sender.doc.download();
    await sender.destroy();

    const buyer = await boot(BUYER, bytes);
    try {
      const boxes = Object.fromEntries(
        buyer.form.listWidgets(buyer.page).map((box) => [buyer.form.get(box.fieldRef)!.name, box]),
      );
      expect(boxes.text_1).toMatchObject({
        groupId: 'buyer',
        canFill: true,
        accent: { color: '#2563eb', strength: 0.16 },
        label: 'text_1, Dana Smith',
      });
      expect(boxes.text_2).toMatchObject({
        groupId: 'seller',
        canFill: false,
        accent: null,
        label: 'text_2, Lanternfield',
      });
      // The fixture's own field is in no group: it reads as it did.
      expect(boxes.name).toMatchObject({ groupId: null, accent: null, label: 'name' });
      expect(buyer.form.canSetGroup('buyer')).toBe(false);
    } finally {
      await buyer.destroy();
    }
  });

  it('shows every group in use with nothing named, and names nobody', async () => {
    const sender = await boot(SENDER, CHANGE_FIXTURE_PDF.slice(), null);
    try {
      sender.form.setDesignGroup('buyer');
      const hers = await sender.place('form-text', { x: 120, y: 300 });
      expect(hers.groupId).toBe('buyer');
      expect(sender.form.listGroups()).toEqual([
        { id: 'buyer', label: null, color: GROUP_COLORS[0] },
      ]);
      sender.interaction.activateTool('form-edit');
      expect(sender.accentOf(hers)).toEqual({ color: GROUP_COLORS[0], strength: 0.16 });
      sender.interaction.activateTool('pointer');
      const box = sender.form
        .listWidgets(sender.page)
        .find((each) => annotationKey(each.ref) === annotationKey(sender.widgetOf(hers)))!;
      expect(box).toMatchObject({
        accent: { color: GROUP_COLORS[0], strength: 0.16 },
        label: 'text_1',
      });
    } finally {
      await sender.destroy();
    }
  });

  it('shows no group at all while the tint is 0', async () => {
    const sender = await boot(SENDER, CHANGE_FIXTURE_PDF.slice(), SIGNERS, { fields: { tint: 0 } });
    try {
      sender.form.setDesignGroup('buyer');
      const hers = await sender.place('form-text', { x: 120, y: 300 });
      sender.interaction.activateTool('form-edit');
      expect(sender.accentOf(hers)).toBeNull();
      sender.interaction.activateTool('pointer');
      expect(sender.form.listWidgets(sender.page).every((box) => box.accent === null)).toBe(true);
      // The names stay: the tint is the colors' switch only.
      expect(sender.form.listGroups()[0]).toMatchObject({ id: 'buyer', label: 'Dana Smith' });
    } finally {
      await sender.destroy();
    }
  });

  it('each open document has its own groups', async () => {
    const kernel = createKernel({
      engine,
      plugins: [interactionPlugin(), renderPlugin(), annotationPlugin(), formPlugin()],
    });
    try {
      for (const id of ['lease', 'nda']) {
        await kernel.documents.open({ kind: 'bytes', id, bytes: CHANGE_FIXTURE_PDF.slice() }, {
          scope: SENDER,
        } as never);
      }
      const lease = kernel.capability(FormToken, 'lease');
      const nda = kernel.capability(FormToken, 'nda');
      lease.setGroups([{ id: 'signer_1', label: 'Dana Smith' }]);
      nda.setGroups([
        { id: 'signer_1', label: 'Sam Lee', color: 'teal' },
        { id: 'signer_2', label: 'Kim Park' },
      ]);
      // The same id in both files is each document's own person.
      expect(lease.listGroups()).toEqual([
        { id: 'signer_1', label: 'Dana Smith', color: GROUP_COLORS[0] },
      ]);
      expect(nda.listGroups()).toEqual([
        { id: 'signer_1', label: 'Sam Lee', color: 'teal' },
        { id: 'signer_2', label: 'Kim Park', color: GROUP_COLORS[1] },
      ]);
      lease.setDesignGroup('buyer');
      expect(nda.getDesignGroup()).toBeNull();
    } finally {
      await kernel.destroy();
    }
  });
});
