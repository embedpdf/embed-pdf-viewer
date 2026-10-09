import { describe, expect, it, vi } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { createTestContext } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import { FORM_DEFAULTS } from '../src/contract';
import { createFormController } from '../src/controller';
import { initialFormState } from '../src/model';

const byObjectNumber = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

const field = (
  objectNumber = 5,
  over: Partial<Extract<FormFieldDTO, { family: 'text' }>> = {},
): FormFieldDTO => ({
  ref: { kind: 'objectNumber', objectNumber },
  name: `name-${objectNumber}`,
  family: 'text',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  groupId: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
  valueEntry: { kind: 'scalar', value: '' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [formWidget(objectNumber + 4, toPageRef(1))],
  value: '',
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
  ...over,
});

/** The form of these fields, each with one widget on page 1. */
const snapshotOf = (fields: readonly FormFieldDTO[]): FormSnapshot => ({
  formKind: 'acroform',
  needsAppearances: false,
  widgets: fields.map(
    (each, index) =>
      ({
        subtype: 'widget',
        ref: {
          kind: 'objectNumber',
          page: toPageRef(1),
          objectNumber: each.widgets[0]!.objectNumber,
        },
        page: toPageRef(1),
        rect: { x: 0, y: index * 30, width: 100, height: 20 },
      }) as unknown as WidgetAnnotation,
  ),
  fields: [...fields],
  calculationOrder: [],
});

/**
 * A session with these permissions, as the engine answers them: a field takes
 * a `fields:fill` (`fields:sign`) permission for its group, or
 * `doc.forms.fill` (`doc.sign`) for every field.
 */
function harness(granted: readonly string[], fields: readonly FormFieldDTO[] = [field()]) {
  const list = vi.fn(async () => snapshotOf(fields));
  const setValue = vi.fn(async () => ({ meta: { changedWidgets: [] } }));
  const reset = vi.fn(async () => ({ fields: [] }));
  const allowsField = (action: 'fill' | 'sign', { groupId }: { groupId: string | null }) =>
    granted.includes(action === 'fill' ? 'doc.forms.fill' : 'doc.sign') ||
    (groupId !== null && granted.includes(`fields:${action}:group=${groupId}`));
  const interaction = {
    registerTool: () => () => {},
    registerHandler: () => () => {},
    getActiveTool: () => ({ id: 'pointer', enables: new Set(['form-fill']) }),
  };
  const create = vi.fn();
  const ctx = createTestContext({
    id: 'form',
    state: initialFormState(),
    settings: { defaults: FORM_DEFAULTS },
    pages: [{ ref: toPageRef(1) }],
    capabilities: [[InteractionToken, interaction]],
    doc: {
      forms: { list, setValue, create, reset },
      security: { allows: (capability: string) => granted.includes(capability), allowsField },
    } as never,
  });
  return { capability: ctx.connect(createFormController(ctx)), list, setValue, create, reset };
}

/** The harness with its form read. */
async function loaded(granted: readonly string[], fields?: readonly FormFieldDTO[]) {
  const fixture = harness(granted, fields);
  await fixture.capability.refresh();
  await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
  await fixture.capability.ensureLoaded(toPageRef(1));
  return fixture;
}

const ALL = ['doc.forms.read', 'doc.forms.fill', 'doc.forms.modify'];

describe('form authority twins', () => {
  it('the three twins mirror their capabilities independently', async () => {
    const fixture = await loaded(['doc.forms.read', 'doc.forms.fill']);
    expect(fixture.capability.canRead()).toBe(true);
    expect(fixture.capability.canFill(byObjectNumber(5))).toBe(true);
    expect(fixture.capability.canFill(byObjectNumber(99))).toBe(false); // not in the form
    expect(fixture.capability.canDesign()).toBe(false);
  });

  it('without read authority the field tree is never requested', async () => {
    const fixture = harness(['doc.forms.fill']);
    await fixture.capability.refresh();
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.capability.getSnapshot()).toBeNull();
    expect(fixture.capability.getStatus()).toBe('forbidden');
  });

  it('without fill authority every widget renders disabled', async () => {
    const fixture = harness(['doc.forms.read']);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    await fixture.capability.ensureLoaded(toPageRef(1));
    expect(fixture.capability.listWidgets(0)[0]?.disabled).toBe(true);
  });

  it('with fill authority the field flags alone decide', async () => {
    const fixture = harness(ALL);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    await fixture.capability.ensureLoaded(toPageRef(1));
    expect(fixture.capability.listWidgets(toPageRef(1))[0]?.disabled).toBe(false);
  });

  it('refuses writes with the engine refusal shape before any engine call', async () => {
    const fixture = harness(['doc.forms.read']);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    await expect(
      fixture.capability.setValue(byObjectNumber(5), { value: 'x' }),
    ).rejects.toMatchObject({ code: 'permission-denied', permission: 'doc.forms.fill' });
    await expect(fixture.capability.reset([byObjectNumber(5)])).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'doc.forms.fill',
    });
    expect(fixture.setValue).not.toHaveBeenCalled();
  });

  it('refuses building the form without doc.forms.modify, before any engine call', async () => {
    const fixture = harness(['doc.forms.read', 'doc.forms.fill']);
    const draft = { family: 'text' as const, name: 'x' };
    for (const call of [
      () => fixture.capability.create(draft),
      () => fixture.capability.update(byObjectNumber(5), { required: true }),
      () => fixture.capability.delete(byObjectNumber(5)),
      () => fixture.capability.repair(),
    ]) {
      await expect(call()).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'doc.forms.modify',
      });
    }
    expect(fixture.create).not.toHaveBeenCalled();
  });

  describe('a signer of one group', () => {
    const BUYER = ['doc.forms.read', 'fields:fill:group=buyer'];
    const fields = [
      field(5, { groupId: 'buyer', required: true }),
      field(6, { groupId: 'seller', required: true }),
    ];

    it('may fill in the group’s fields, and the other fields render disabled', async () => {
      const fixture = await loaded(BUYER, fields);
      expect(fixture.capability.canFill(byObjectNumber(5))).toBe(true);
      expect(fixture.capability.canFill(byObjectNumber(6))).toBe(false);
      expect(fixture.capability.listWidgets(toPageRef(1)).map((item) => item.disabled)).toEqual([
        false,
        true,
      ]);
    });

    it('is refused a write to another group’s field, naming what it takes', async () => {
      const fixture = await loaded(BUYER, fields);
      await expect(
        fixture.capability.setValue(byObjectNumber(6), { value: 'x' }),
      ).rejects.toMatchObject({
        code: 'permission-denied',
        permission: 'fields:fill:group=seller',
      });
      await fixture.capability.setValue(byObjectNumber(5), { value: 'x' });
      expect(fixture.setValue).toHaveBeenCalledTimes(1);
    });

    it('validates only its own fields, and a reset puts back only those', async () => {
      const fixture = await loaded(BUYER, fields);
      expect(fixture.capability.validate().missing.map((each) => each.name)).toEqual(['name-5']);
      await fixture.capability.reset();
      expect(fixture.reset).toHaveBeenCalledWith([byObjectNumber(5)]);
      await expect(fixture.capability.reset([byObjectNumber(6)])).rejects.toMatchObject({
        code: 'permission-denied',
      });
    });
  });
});
