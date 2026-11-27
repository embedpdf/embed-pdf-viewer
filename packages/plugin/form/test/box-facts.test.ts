/**
 * What a box tells an app that draws it or attaches UI to it: its own
 * address, its field's group, whether the session may fill it in, whether the
 * form asks for a value and whether it holds one, where UI anchors to it, and
 * whether the cursor is in it.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormField,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { createTestContext } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import { FORM_DEFAULTS, type FormConfig } from '../src/contract';
import { createFormController } from '../src/controller';
import { initialFormModel } from '../src/model';

const PAGE = toPageRef(1);

const base = {
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  groupId: null,
  forAnyone: false,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
} as const;

const text = (over: Partial<Extract<FormField, { kind: 'text' }>> = {}): FormField => ({
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 5 },
  name: 'name',
  kind: 'text',
  valueEntry: { kind: 'scalar', value: '' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [formWidget(9, PAGE)],
  value: '',
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
  format: null,
  ...over,
});

const checkbox = (over: Partial<Extract<FormField, { kind: 'checkbox' }>> = {}): FormField => ({
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 6 },
  name: 'agree',
  kind: 'checkbox',
  valueEntry: { kind: 'scalar', value: 'Off' },
  defaultValueEntry: { kind: 'scalar', value: 'Off' },
  widgets: [{ ...formWidget(10, PAGE), onState: 'Yes', exportValue: 'Yes', checked: false }],
  checked: false,
  exportValue: 'Yes',
  ...over,
});

const signature = (over: Partial<Extract<FormField, { kind: 'signature' }>> = {}): FormField => ({
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 7 },
  name: 'sign',
  kind: 'signature',
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [formWidget(11, PAGE)],
  ...over,
});

const row = (objectNumber: number, y: number, over: object = {}): WidgetAnnotation =>
  ({
    subtype: 'widget',
    ref: { kind: 'objectNumber', page: PAGE, objectNumber },
    page: PAGE,
    rect: { x: 10, y, width: 100, height: 20 },
    hidden: false,
    noView: false,
    ...over,
  }) as unknown as WidgetAnnotation;

const snapshotOf = (
  fields: FormField[],
  rows: WidgetAnnotation[] = [row(9, 0), row(10, 40), row(11, 80)],
): FormSnapshot => ({
  formKind: 'acroform',
  needsAppearances: false,
  widgets: rows,
  fields,
  calculationOrder: [],
});

interface Rights {
  /** The groups the session may fill in; `'*'` for every field. */
  fill?: readonly (string | null)[] | '*';
  /** The groups the session may sign; `'*'` for every field. */
  sign?: readonly (string | null)[] | '*';
}

/** A form read and loaded, with the pointer tool active (it fills forms). */
async function loaded(snapshot: FormSnapshot, rights: Rights = {}, config?: FormConfig) {
  const { fill = '*', sign = '*' } = rights;
  const ctx = createTestContext({
    id: 'form',
    state: initialFormModel(),
    settings: { defaults: FORM_DEFAULTS, registered: config },
    pages: [{ ref: PAGE }],
    capabilities: [
      [
        InteractionToken,
        {
          registerTool: () => () => {},
          registerHandler: () => () => {},
          getActiveTool: () => ({ id: 'pointer', enables: new Set(['form-fill']) }),
        },
      ],
    ],
    doc: {
      forms: { list: vi.fn(async () => snapshot), create: vi.fn() },
      apply: vi.fn(async () => ({ items: [], meta: { undoable: true } })),
      security: {
        allows: () => true,
        allowsField: (right: 'fill' | 'sign', field: { groupId: string | null }) => {
          const groups = right === 'fill' ? fill : sign;
          return groups === '*' || groups.includes(field.groupId);
        },
      },
    } as never,
  });
  const form = ctx.connect(createFormController(ctx));
  await form.refresh();
  await vi.waitFor(() => expect(form.getSnapshot()).not.toBeNull());
  await form.ensureLoaded(PAGE);
  return form;
}

describe('what a box tells you', () => {
  it("carries its own address, the one `getWidget()` and the field's rows give", async () => {
    const form = await loaded(snapshotOf([text()]));
    const [box] = form.listWidgets(PAGE);
    expect(box!.ref).toEqual({ kind: 'objectNumber', page: PAGE, objectNumber: 9 });
    expect(box!.ref).toEqual(box!.annotationRef);
    expect(box!.ref).toBe(form.getWidgets(box!.fieldRef)[0]!.ref);
    expect(form.getWidget(box!.ref)?.rect).toEqual({ x: 10, y: 0, width: 100, height: 20 });
  });

  it('says which group its field is in, or `null`', async () => {
    const form = await loaded(snapshotOf([text({ groupId: 'bob' }), checkbox()]));
    expect(form.listWidgets(PAGE).map((box) => box.groupId)).toEqual(['bob', null]);
  });

  it('says whether the form asks for a value, and whether it holds one', async () => {
    const form = await loaded(
      snapshotOf([
        text({ required: true }),
        checkbox({ checked: true, valueEntry: { kind: 'scalar', value: 'Yes' } }),
        signature({ required: true }),
      ]),
    );
    expect(
      form.listWidgets(PAGE).map(({ control, required, empty }) => ({ control, required, empty })),
    ).toEqual([
      { control: 'text', required: true, empty: true },
      { control: 'toggle', required: false, empty: false },
      { control: 'signature', required: true, empty: true },
    ]);
  });

  it('a filled text box and a signed signature box are not empty', async () => {
    const form = await loaded(
      snapshotOf([
        text({ value: 'Ada', valueEntry: { kind: 'scalar', value: 'Ada' } }),
        signature({ valueEntry: { kind: 'unsupported' } }),
      ]),
    );
    expect(form.listWidgets(PAGE).map((box) => box.empty)).toEqual([false, false]);
  });

  it('`canFill` is the fill right for a field, and the sign right for a signature field', async () => {
    const fields = [text({ groupId: 'bob' }), checkbox({ groupId: 'carol' }), signature()];
    // Bob fills his own fields, and signs nothing.
    const bob = await loaded(snapshotOf(fields), { fill: ['bob'], sign: [] });
    expect(bob.listWidgets(PAGE).map((box) => box.canFill)).toEqual([true, false, false]);
    // A session that only signs may fill in the signature field, and no other.
    const signer = await loaded(snapshotOf(fields), { fill: [], sign: '*' });
    expect(signer.listWidgets(PAGE).map((box) => box.canFill)).toEqual([false, false, true]);
  });

  it('`canFill` is the permission alone: a read-only field and the `fillable` setting leave it', async () => {
    const readOnly = await loaded(snapshotOf([text({ readOnly: true })]));
    expect(readOnly.listWidgets(PAGE)[0]).toMatchObject({ canFill: true, disabled: true });
    const off = await loaded(snapshotOf([text()]), {}, { fillable: false });
    expect(off.listWidgets(PAGE)[0]).toMatchObject({ canFill: true, disabled: true });
    const denied = await loaded(snapshotOf([text()]), { fill: [] });
    expect(denied.listWidgets(PAGE)[0]).toMatchObject({ canFill: false, disabled: true });
  });
});

describe("a box's anchor", () => {
  it('is its page and where the box stands, the same object while it stays', async () => {
    const form = await loaded(snapshotOf([text()]));
    const [box] = form.listWidgets(PAGE);
    const anchor = form.getWidgetAnchor(box!.ref);
    expect(anchor).toEqual({ page: PAGE, bounds: { x: 10, y: 0, width: 100, height: 20 } });
    expect(form.getWidgetAnchor(box!.ref)).toBe(anchor);
  });

  it('is where a turned box stands, not its frame before the turn', async () => {
    const stands = { x: 10, y: 0, width: 20, height: 100 };
    const turned = row(9, 0, {
      box: { x: -30, y: 40, width: 100, height: 20 },
      rotation: 90,
      rect: stands,
    });
    const form = await loaded(snapshotOf([text()], [turned]));
    expect(form.getWidgetAnchor(turned.ref)?.bounds).toEqual(stands);
  });

  it('is `null` for a box that is not there, and for one that shows nowhere', async () => {
    const hidden = row(10, 40, { hidden: true });
    const form = await loaded(snapshotOf([text(), checkbox()], [row(9, 0), hidden]));
    expect(form.getWidgetAnchor({ kind: 'objectNumber', page: PAGE, objectNumber: 77 })).toBeNull();
    expect(form.getWidgetAnchor(hidden.ref)).toBeNull();
  });
});

describe('the box the cursor is in', () => {
  it('is the box whose control took the focus, until it leaves', async () => {
    vi.useFakeTimers();
    try {
      const form = await loaded(snapshotOf([text(), checkbox()]));
      const [name, agree] = form.listWidgets(PAGE);
      expect(form.isWidgetFocused(name!.ref)).toBe(false);
      form.notifyWidgetEvent(name!.fieldRef, name!.ref, 'focus');
      expect(form.isWidgetFocused(name!.ref)).toBe(true);
      expect(form.isWidgetFocused(agree!.ref)).toBe(false);
      // From one box to the next is one move: the blur and the focus that follows it.
      form.notifyWidgetEvent(name!.fieldRef, name!.ref, 'blur');
      form.notifyWidgetEvent(agree!.fieldRef, agree!.ref, 'focus');
      expect(form.isWidgetFocused(name!.ref)).toBe(false);
      expect(form.isWidgetFocused(agree!.ref)).toBe(true);
      form.notifyWidgetEvent(agree!.fieldRef, agree!.ref, 'blur');
      await vi.runAllTimersAsync();
      expect(form.isWidgetFocused(agree!.ref)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
