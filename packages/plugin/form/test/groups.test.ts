/**
 * The form's groups as people see them: who each one is and the color its fields show in
 * (`setGroups()`, per document), who new fields are placed for (the design group), moving
 * fields to a group, and what a box shows of its group: its color while its user fills it in,
 * and whose it is in its accessible name.
 */
import { PluginError } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import {
  formWidget,
  toPageRef,
  type FormField,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { describe, expect, it, vi } from 'vitest';

import {
  FORM_DEFAULTS,
  type FormConfig,
  type FormDesignGroupChangedEvent,
  type FormGroupInput,
  type FormGroupsChangedEvent,
} from '../src/contract';
import { createFormController } from '../src/controller';
import { initialFormModel } from '../src/model';
import { GROUP_COLORS } from '../src/services/groups';
import { formState } from '../src/state';

const PAGE = toPageRef(1);

const base = {
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  groupId: null,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
} as const;

const text = (
  objectNumber: number,
  over: Partial<Extract<FormField, { kind: 'text' }>> = {},
): FormField => ({
  ...base,
  ref: { kind: 'objectNumber', objectNumber },
  name: `text-${objectNumber}`,
  kind: 'text',
  valueEntry: { kind: 'scalar', value: '' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [formWidget(objectNumber + 100, PAGE)],
  value: '',
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
  format: null,
  ...over,
});

const signature = (
  objectNumber: number,
  over: Partial<Extract<FormField, { kind: 'signature' }>> = {},
): FormField => ({
  ...base,
  ref: { kind: 'objectNumber', objectNumber },
  name: `sign-${objectNumber}`,
  kind: 'signature',
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [formWidget(objectNumber + 100, PAGE)],
  ...over,
});

const button = (
  objectNumber: number,
  over: Partial<Extract<FormField, { kind: 'pushbutton' }>> = {},
): FormField =>
  ({
    ...base,
    ref: { kind: 'objectNumber', objectNumber },
    name: `button-${objectNumber}`,
    kind: 'pushbutton',
    valueEntry: { kind: 'none' },
    defaultValueEntry: { kind: 'none' },
    widgets: [formWidget(objectNumber + 100, PAGE)],
    ...over,
  }) as FormField;

/** A radio group with two buttons, `monthly` and `yearly`. */
const radio = (
  objectNumber: number,
  over: Partial<Extract<FormField, { kind: 'radio' }>> = {},
): FormField =>
  ({
    ...base,
    ref: { kind: 'objectNumber', objectNumber },
    name: `plan-${objectNumber}`,
    kind: 'radio',
    alternateName: 'Plan',
    valueEntry: { kind: 'scalar', value: 'Off' },
    defaultValueEntry: { kind: 'scalar', value: 'Off' },
    widgets: [
      {
        ...formWidget(objectNumber + 100, PAGE),
        onState: 'monthly',
        exportValue: 'monthly',
        checked: false,
      },
      {
        ...formWidget(objectNumber + 101, PAGE),
        onState: 'yearly',
        exportValue: 'yearly',
        checked: false,
      },
    ],
    value: 'Off',
    radiosInUnison: false,
    noToggleToOff: true,
    ...over,
  }) as FormField;

/** The form of these fields, each widget a row on page 1. */
const snapshotOf = (fields: readonly FormField[]): FormSnapshot => ({
  formKind: 'acroform',
  needsAppearances: false,
  widgets: fields.flatMap((field) =>
    field.widgets.map(
      (widget, index) =>
        ({
          subtype: 'widget',
          ref: { kind: 'objectNumber', page: PAGE, objectNumber: widget.objectNumber },
          page: PAGE,
          rect: { x: 10 + index * 30, y: widget.objectNumber, width: 20, height: 20 },
          hidden: false,
          noView: false,
        }) as unknown as WidgetAnnotation,
    ),
  ),
  fields: [...fields],
  calculationOrder: [],
});

interface Session {
  /** The groups the session may fill in; `'*'` for every field. */
  fill?: readonly (string | null)[] | '*';
  /** The groups the session may sign; `'*'` for every field. */
  sign?: readonly (string | null)[] | '*';
  /** The groups the session may put a field in; `'*'` for every group. */
  setGroup?: readonly string[] | '*';
  /** Whether the session may design the form (`doc.forms.modify`). */
  design?: boolean;
  /** Who the app says the document's groups are (`setGroups()`). */
  groups?: readonly FormGroupInput[];
}

const BUYER_AND_SELLER: readonly FormGroupInput[] = [
  { id: 'buyer', label: 'Dana Smith', color: '#2563eb' },
  { id: 'seller', label: 'Lanternfield' },
];

/** The default strength: `fields.tint`. */
const TINT = FORM_DEFAULTS.fields.tint;
const accent = (color: string, strength = TINT) => ({ color, strength });

/** A form read and loaded, with the pointer tool active (it fills forms), and what it sent. */
async function boot(fields: readonly FormField[], session: Session = {}, config?: FormConfig) {
  const { fill = '*', sign = '*', setGroup = '*', design = true, groups } = session;
  const snapshot = snapshotOf(fields);
  const apply = vi.fn(async () => ({ items: [], meta: { undoable: true } }));
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
      apply,
      security: {
        allows: (capability: string) => capability !== 'doc.forms.modify' || design,
        allowsField: (
          right: 'fill' | 'sign' | 'set-group',
          { groupId }: { groupId: string | null },
        ) => {
          const allowed = right === 'fill' ? fill : right === 'sign' ? sign : setGroup;
          return allowed === '*' || (allowed as readonly (string | null)[]).includes(groupId);
        },
      },
    } as never,
  });
  const form = ctx.connect(createFormController(ctx));
  await form.refresh();
  await vi.waitFor(() => expect(form.getSnapshot()).not.toBeNull());
  await form.ensureLoaded(PAGE);
  if (groups) form.setGroups(groups);
  return { form, apply };
}

const loaded = async (fields: readonly FormField[], session: Session = {}, config?: FormConfig) =>
  (await boot(fields, session, config)).form;

describe('setGroups()', () => {
  it('names the document’s groups: the whole list, and an empty one clears it', async () => {
    const form = await loaded([]);
    expect(form.listGroups()).toEqual([]);
    form.setGroups(BUYER_AND_SELLER);
    expect(form.listGroups().map((group) => group.id)).toEqual(['buyer', 'seller']);
    form.setGroups([{ id: 'witness', label: 'Sam Lee' }]);
    expect(form.listGroups()).toEqual([
      { id: 'witness', label: 'Sam Lee', color: GROUP_COLORS[0] },
    ]);
    form.setGroups([]);
    expect(form.listGroups()).toEqual([]);
  });

  it('fires `onGroupsChanged` with the groups as they are now, and not for the same list again', async () => {
    const form = await loaded([text(1, { groupId: 'witness' })]);
    const events: FormGroupsChangedEvent[] = [];
    form.onGroupsChanged((event) => events.push(event));
    form.setGroups(BUYER_AND_SELLER);
    // The same people in a new array: an app's effect may send the list on every render.
    form.setGroups(BUYER_AND_SELLER.map((group) => ({ ...group })));
    form.setGroups([]);
    expect(events).toHaveLength(2);
    expect(events[0]!.groups.map((group) => group.id)).toEqual(['buyer', 'seller', 'witness']);
    expect(events[1]!.groups.map((group) => group.id)).toEqual(['witness']);
  });

  it('takes the first entry of an id named twice', async () => {
    const form = await loaded([], {
      groups: [
        { id: 'buyer', color: 'red' },
        { id: 'buyer', color: 'blue' },
      ],
    });
    expect(form.listGroups()).toEqual([{ id: 'buyer', label: null, color: 'red' }]);
  });

  it('is the document’s own: the settings hold no groups', async () => {
    const form = await loaded([], { groups: BUYER_AND_SELLER });
    expect(form.getSettings()).not.toHaveProperty('groups');
    expect(FORM_DEFAULTS).not.toHaveProperty('groups');
  });
});

describe('listGroups()', () => {
  it('gives the named groups in their order, each with its label and its color', async () => {
    const form = await loaded([], { groups: BUYER_AND_SELLER });
    expect(form.listGroups()).toEqual([
      { id: 'buyer', label: 'Dana Smith', color: '#2563eb' },
      { id: 'seller', label: 'Lanternfield', color: GROUP_COLORS[1] },
    ]);
  });

  it('adds the groups the form uses that the app did not name, with no label and a color', async () => {
    const fields = [
      text(1, { groupId: 'witness' }),
      text(2, { groupId: 'buyer' }),
      text(3),
      text(4, { groupId: 'witness' }),
    ];
    const form = await loaded(fields, { groups: BUYER_AND_SELLER });
    expect(form.listGroups().map((group) => group.id)).toEqual(['buyer', 'seller', 'witness']);
    expect(form.listGroups()[2]).toEqual({ id: 'witness', label: null, color: GROUP_COLORS[2] });
  });

  it('lists the groups a form uses when the app names none, in the fields’ order', async () => {
    const form = await loaded([
      text(1, { groupId: 'seller' }),
      text(2),
      text(3, { groupId: 'buyer' }),
    ]);
    expect(form.listGroups()).toEqual([
      { id: 'seller', label: null, color: GROUP_COLORS[0] },
      { id: 'buyer', label: null, color: GROUP_COLORS[1] },
    ]);
  });

  it('lists nothing for a form without groups and an app that names none', async () => {
    const form = await loaded([text(1)]);
    expect(form.listGroups()).toEqual([]);
  });

  it('is the same array until the groups change', async () => {
    const form = await loaded([text(1, { groupId: 'buyer' })], { groups: BUYER_AND_SELLER });
    const before = form.listGroups();
    expect(form.listGroups()).toBe(before);
    form.updateSettings({ fields: { tint: 0.3 } });
    expect(form.listGroups()).toBe(before);
    form.setGroups([{ id: 'buyer', label: 'Dana' }]);
    expect(form.listGroups()).toEqual([{ id: 'buyer', label: 'Dana', color: GROUP_COLORS[0] }]);
  });
});

describe('a group without a color of its own', () => {
  it('gets the color at its place in the list, so no two of the first eight share one', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const form = await loaded([], { groups: ids.map((id) => ({ id })) });
    const colors = form.listGroups().map((group) => group.color);
    expect(colors.slice(0, 8)).toEqual(GROUP_COLORS);
    expect(new Set(colors.slice(0, 8)).size).toBe(8);
    // The ninth group gets the first color again.
    expect(colors[8]).toBe(GROUP_COLORS[0]);
  });

  it('keeps its place’s color beside a group with a color of its own', async () => {
    const form = await loaded([], {
      groups: [{ id: 'buyer', color: 'var(--signer-1)' }, { id: 'seller' }, { id: 'witness' }],
    });
    expect(form.listGroups().map((group) => group.color)).toEqual([
      'var(--signer-1)',
      GROUP_COLORS[1],
      GROUP_COLORS[2],
    ]);
  });

  it('does not go by the id: the same id shows in another color at another place', async () => {
    const first = await loaded([], { groups: [{ id: 'buyer' }, { id: 'seller' }] });
    const second = await loaded([], { groups: [{ id: 'seller' }, { id: 'buyer' }] });
    expect(first.listGroups()[0]!.color).toBe(second.listGroups()[0]!.color);
    expect(first.listGroups().find((group) => group.id === 'buyer')!.color).not.toBe(
      second.listGroups().find((group) => group.id === 'buyer')!.color,
    );
  });
});

describe('who new fields are placed for', () => {
  it('starts naming no group, and is the group last set', async () => {
    const form = await loaded([], { groups: BUYER_AND_SELLER });
    expect(form.getDesignGroup()).toBeNull();
    form.setDesignGroup('seller');
    expect(form.getDesignGroup()).toBe('seller');
    form.setDesignGroup(null);
    expect(form.getDesignGroup()).toBeNull();
  });

  it('takes a group the app does not name: a group is an id', async () => {
    const form = await loaded([]);
    form.setDesignGroup('witness');
    expect(form.getDesignGroup()).toBe('witness');
  });

  it('fires `onDesignGroupChanged` once per change, and not for the same group again', async () => {
    const form = await loaded([], { groups: BUYER_AND_SELLER });
    const events: FormDesignGroupChangedEvent[] = [];
    form.onDesignGroupChanged((event) => events.push(event));
    form.setDesignGroup('buyer');
    form.setDesignGroup('buyer');
    form.setDesignGroup('seller');
    form.setDesignGroup(null);
    expect(events).toEqual([{ groupId: 'buyer' }, { groupId: 'seller' }, { groupId: null }]);
  });

  it('is in the form’s state, beside the groups', async () => {
    const form = await loaded([text(1, { groupId: 'buyer' })], { groups: BUYER_AND_SELLER });
    form.setDesignGroup('buyer');
    const state = formState.read(form);
    expect(state.designGroup).toBe('buyer');
    expect(state.groups).toBe(form.listGroups());
    expect(formState.empty).toMatchObject({ designGroup: null, groups: [], selectedFields: [] });
  });
});

describe('canSetGroup()', () => {
  it('is the right to design the form and to put a field in that group', async () => {
    const sender = await loaded([], { setGroup: ['buyer', 'seller'] });
    expect(sender.canSetGroup('buyer')).toBe(true);
    expect(sender.canSetGroup('witness')).toBe(false);
    const filler = await loaded([], { setGroup: '*', design: false });
    expect(filler.canSetGroup('buyer')).toBe(false);
  });

  it('`setDesignGroup()` refuses a group the user may not put a field in, and keeps the one set', async () => {
    const form = await loaded([], { setGroup: ['buyer'] });
    form.setDesignGroup('buyer');
    let refusal: unknown;
    try {
      form.setDesignGroup('seller');
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(PluginError);
    expect(refusal).toMatchObject({
      code: 'permission-denied',
      permission: 'fields:set-group:group=seller',
    });
    expect(form.getDesignGroup()).toBe('buyer');
    // Naming no group is always allowed.
    form.setDesignGroup(null);
    expect(form.getDesignGroup()).toBeNull();
  });

  it('`create()` and `update()` refuse a group the user may not put a field in', async () => {
    const form = await loaded([text(1, { groupId: 'buyer' })], { setGroup: ['buyer'] });
    await expect(
      form.create({ kind: 'text', name: 'theirs', groupId: 'seller', widgets: [] }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'fields:set-group:group=seller',
    });
    await expect(
      form.update({ kind: 'objectNumber', objectNumber: 1 }, { groupId: 'seller' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('taking a field out of its group, or making one in none, takes form design alone', async () => {
    const { form, apply } = await boot([text(1, { groupId: 'buyer' })], { setGroup: [] });
    // The stand-in engine answers with nothing, so only the sending is read here.
    void form.update({ kind: 'objectNumber', objectNumber: 1 }, { groupId: null }).catch(() => {});
    expect(form.get({ kind: 'objectNumber', objectNumber: 1 })!.groupId).toBeNull();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    // A new field in no group is not refused for a group right either.
    const made = await Promise.race([
      form.create({ kind: 'text', name: 'nobodys', groupId: null, widgets: [] }).then(
        () => 'sent',
        (error: { code?: string }) => error.code ?? 'failed',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('on its way'), 50)),
    ]);
    expect(made).not.toBe('permission-denied');
    // Without form design, neither.
    const filler = await loaded([text(1, { groupId: 'buyer' })], { design: false });
    await expect(
      filler.update({ kind: 'objectNumber', objectNumber: 1 }, { groupId: null }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('naming a group takes no right: a signer’s page names them too', async () => {
    const signer = await loaded([text(1, { groupId: 'buyer' })], {
      fill: ['buyer'],
      setGroup: [],
      design: false,
      groups: BUYER_AND_SELLER,
    });
    expect(signer.listGroups().map((group) => group.label)).toEqual(['Dana Smith', 'Lanternfield']);
  });
});

describe('moveToGroup()', () => {
  const ref = (objectNumber: number) => ({ kind: 'objectNumber', objectNumber }) as const;

  it('puts the fields in the group as one change, leaving out the ones already in it', async () => {
    const { form, apply } = await boot([
      text(1),
      text(2, { groupId: 'buyer' }),
      text(3, { groupId: 'seller' }),
    ]);
    const { fields } = await form.moveToGroup([ref(1), ref(2), ref(3), ref(1)], 'buyer');
    expect(fields.map((field) => field.name)).toEqual(['text-1', 'text-2', 'text-3', 'text-1']);
    expect(apply).toHaveBeenCalledTimes(1);
    const { ops } = (apply.mock.calls[0] as unknown as [{ ops: unknown[] }])[0];
    expect(ops).toEqual([
      { type: 'forms.update', field: ref(1), patch: { groupId: 'buyer' } },
      { type: 'forms.update', field: ref(3), patch: { groupId: 'buyer' } },
    ]);
  });

  it('takes fields out of their group with `null`, with form design alone', async () => {
    const { form, apply } = await boot(
      [text(1, { groupId: 'buyer' }), text(2), text(3, { groupId: 'seller' })],
      { setGroup: [] },
    );
    void form.moveToGroup([ref(1), ref(2), ref(3)], null).catch(() => undefined);
    // At once, and the groups nobody is in any more leave the list.
    expect(form.list().map((field) => field.groupId)).toEqual([null, null, null]);
    expect(form.listGroups()).toEqual([]);
    const { ops } = (apply.mock.calls[0] as unknown as [{ ops: unknown[] }])[0];
    expect(ops).toEqual([
      { type: 'forms.update', field: ref(1), patch: { groupId: null } },
      { type: 'forms.update', field: ref(3), patch: { groupId: null } },
    ]);
  });

  it('shows the fields in the group at once', async () => {
    const { form } = await boot([text(1), text(2)]);
    void form.moveToGroup([ref(1), ref(2)], 'buyer').catch(() => undefined);
    expect(form.list().map((field) => field.groupId)).toEqual(['buyer', 'buyer']);
    expect(form.listGroups().map((group) => group.id)).toEqual(['buyer']);
  });

  it('sends nothing when every field is in the group already', async () => {
    const { form, apply } = await boot([text(1, { groupId: 'buyer' })]);
    await expect(form.moveToGroup([ref(1)], 'buyer')).resolves.toMatchObject({
      fields: [{ name: 'text-1' }],
    });
    await expect(form.moveToGroup([], 'buyer')).resolves.toEqual({ fields: [] });
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses a group the user may not put a field in, a form they may not design, and a field that isn’t there', async () => {
    const { form, apply } = await boot([text(1)], { setGroup: ['buyer'] });
    await expect(form.moveToGroup([ref(1)], 'seller')).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'fields:set-group:group=seller',
    });
    await expect(form.moveToGroup([ref(1), ref(9)], 'buyer')).rejects.toMatchObject({
      code: 'not-found',
    });
    const filler = await loaded([text(1)], { design: false });
    await expect(filler.moveToGroup([ref(1)], 'buyer')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('the group among a field’s settings', () => {
  const NAME = { kind: 'objectNumber', objectNumber: 1 } as const;
  const groupSetting = (form: Awaited<ReturnType<typeof loaded>>) =>
    form.getFieldSettings(NAME)!.properties.find((setting) => setting.key === 'groupId');

  it('is not there while the document has no groups', async () => {
    const form = await loaded([text(1)]);
    expect(groupSetting(form)).toBeUndefined();
    expect(form.getFieldSettings(NAME)!.values).not.toHaveProperty('groupId');
  });

  it('is a choice among the groups the user may put a field in, with the field’s own', async () => {
    const form = await loaded([text(1, { groupId: 'witness' })], {
      setGroup: ['buyer'],
      groups: BUYER_AND_SELLER,
    });
    expect(groupSetting(form)).toEqual({
      key: 'groupId',
      control: 'choice',
      label: 'Filled in by',
      labelKey: 'form.settings.group',
      options: ['buyer', 'witness'],
      free: false,
    });
    expect(form.getFieldSettings(NAME)!.values.groupId).toBe('witness');
  });

  it('appears once the app names a group, and reads `null` for a field in none', async () => {
    const form = await loaded([text(1)]);
    form.setGroups([{ id: 'buyer' }]);
    expect(groupSetting(form)).toMatchObject({ options: ['buyer'] });
    expect(form.getFieldSettings(NAME)!.values.groupId).toBeNull();
  });
});

describe('a box’s accent', () => {
  const fields = [text(1, { groupId: 'buyer' }), text(2, { groupId: 'seller' }), text(3)];
  const accents = (form: Awaited<ReturnType<typeof loaded>>) =>
    form.listWidgets(PAGE).map((box) => box.accent);

  it('is its group’s color for the fields the user may fill in, and `null` for other people’s', async () => {
    const dana = await loaded(fields, { fill: ['buyer'], groups: BUYER_AND_SELLER });
    expect(accents(dana)).toEqual([accent('#2563eb'), null, null]);
    const director = await loaded(fields, { fill: ['seller'], groups: BUYER_AND_SELLER });
    expect(accents(director)).toEqual([null, accent(GROUP_COLORS[1]!), null]);
  });

  it('shows for every group in use, with nothing named', async () => {
    const form = await loaded(fields);
    expect(accents(form)).toEqual([accent(GROUP_COLORS[0]!), accent(GROUP_COLORS[1]!), null]);
  });

  it('is `null` on every box while the tint is 0', async () => {
    const form = await loaded(fields, { groups: BUYER_AND_SELLER }, { fields: { tint: 0 } });
    expect(accents(form)).toEqual([null, null, null]);
    form.updateSettings({ fields: { tint: 0.4 } });
    expect(accents(form)).toEqual([accent('#2563eb', 0.4), accent(GROUP_COLORS[1]!, 0.4), null]);
  });

  it('follows the groups while the app runs', async () => {
    const form = await loaded(fields, { fill: ['buyer'] });
    const before = form.listWidgets(PAGE);
    form.setGroups([{ id: 'buyer', color: 'var(--signer-1)' }]);
    expect(accents(form)).toEqual([accent('var(--signer-1)'), null, null]);
    expect(form.listWidgets(PAGE)).not.toBe(before);
    form.setGroups([]);
    expect(accents(form)).toEqual([accent(GROUP_COLORS[0]!), null, null]);
  });

  it('is the same object for every box of a group, until the groups or the tint change', async () => {
    const form = await loaded([text(1, { groupId: 'buyer' }), text(2, { groupId: 'buyer' })]);
    const [first, second] = form.listWidgets(PAGE);
    expect(first!.accent).toBe(second!.accent);
  });

  it('is `null` for a field that takes no value: read-only, a signed signature, a push button', async () => {
    const form = await loaded(
      [
        text(1, { groupId: 'buyer', readOnly: true }),
        signature(2, { groupId: 'buyer' }),
        signature(3, { groupId: 'buyer', valueEntry: { kind: 'unsupported' } }),
        button(4, { groupId: 'buyer' }),
      ],
      { groups: BUYER_AND_SELLER },
    );
    expect(accents(form)).toEqual([null, accent('#2563eb'), null, null]);
  });

  it('is the sign right’s for a signature field', async () => {
    const form = await loaded([text(1, { groupId: 'buyer' }), signature(2, { groupId: 'buyer' })], {
      fill: [],
      sign: ['buyer'],
      groups: BUYER_AND_SELLER,
    });
    expect(accents(form)).toEqual([null, accent('#2563eb')]);
  });

  it('does not follow the `fillable` setting: the field is still the user’s', async () => {
    const form = await loaded(
      fields,
      { fill: ['buyer'], groups: BUYER_AND_SELLER },
      { fillable: false },
    );
    expect(form.listWidgets(PAGE)[0]).toMatchObject({ accent: accent('#2563eb'), disabled: true });
  });
});

describe('a box’s accessible name', () => {
  const labels = (form: Awaited<ReturnType<typeof loaded>>) =>
    form.listWidgets(PAGE).map((box) => box.label);

  it('says whose field it is, for the user’s own and for other people’s', async () => {
    const form = await loaded(
      [
        text(1, { groupId: 'buyer', alternateName: 'Signature' }),
        text(2, { groupId: 'seller' }),
        text(3),
      ],
      { fill: ['buyer'], groups: BUYER_AND_SELLER },
    );
    expect(labels(form)).toEqual(['Signature, Dana Smith', 'text-2, Lanternfield', 'text-3']);
  });

  it('puts a radio button’s option before whose it is', async () => {
    const form = await loaded([radio(1, { groupId: 'buyer' })], { groups: BUYER_AND_SELLER });
    expect(labels(form)).toEqual(['Plan: monthly, Dana Smith', 'Plan: yearly, Dana Smith']);
  });

  it('stays as it is for a group without a label, named or not', async () => {
    const fields = [text(1, { groupId: 'buyer' }), radio(2, { groupId: 'buyer' })];
    expect(labels(await loaded(fields, { groups: [{ id: 'buyer' }] }))).toEqual([
      'text-1',
      'Plan: monthly',
      'Plan: yearly',
    ]);
    expect(labels(await loaded(fields))).toEqual(['text-1', 'Plan: monthly', 'Plan: yearly']);
  });
});
