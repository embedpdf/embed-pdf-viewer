import { describe, expect, it, vi } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
} from '@embedpdf/engine-core/runtime';
import { createTestContext } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import { FORM_DEFAULTS } from '../src/contract';
import { createFormController } from '../src/controller';
import { initialFormState } from '../src/model';

const byObjectNumber = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

const field = (): FormFieldDTO => ({
  ref: { kind: 'objectNumber', objectNumber: 5 },
  name: 'name',
  family: 'text',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'scalar', value: '' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [{ ...formWidget(9, toPageRef(1)), rect: null }],
  value: '',
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
});

const SNAPSHOT: FormSnapshot = {
  formKind: 'acroform',
  needsAppearances: false,
  fields: [field()],
  calculationOrder: [],
};

function harness(granted: readonly string[]) {
  const list = vi.fn(async () => SNAPSHOT);
  const setValue = vi.fn(async () => ({ meta: { changedWidgets: [] } }));
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
      forms: { list, setValue, create },
      page: () => ({
        annotations: {
          list: async () => ({
            annotations: [
              {
                subtype: 'widget',
                ref: { kind: 'objectNumber', page: toPageRef(1), objectNumber: 9 },
                rect: { x: 0, y: 0, width: 100, height: 20 },
              },
            ],
          }),
        },
      }),
      security: { allows: (capability: string) => granted.includes(capability) },
    } as never,
  });
  return { capability: ctx.connect(createFormController(ctx)), list, setValue, create };
}

const ALL = ['doc.forms.read', 'doc.forms.fill', 'doc.forms.modify'];

describe('form authority twins', () => {
  it('the three twins mirror their capabilities independently', () => {
    const fixture = harness(['doc.forms.read', 'doc.forms.fill']);
    expect(fixture.capability.canRead()).toBe(true);
    expect(fixture.capability.canFill()).toBe(true);
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
});
