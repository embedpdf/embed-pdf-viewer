import { describe, expect, it, vi } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
} from '@embedpdf/engine-core/runtime';
import { createTestContext } from '@embedpdf/core/testing';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import { createFormController } from '../src/controller';
import { fieldRef } from '../src/host-contract';
import { initialFormState } from '../src/model';

const field = (): FormFieldDTO => ({
  ref: { kind: 'objectNumber', fieldObjectNumber: 5 },
  fieldObjectNumber: 5,
  name: 'name',
  family: 'text',
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 0 },
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'scalar', value: '' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [formWidget(9, toPageRef(1))],
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
  const setValue = vi.fn(async () => ({ changedWidgets: [] }));
  const interaction = {
    registerTool: () => () => {},
    registerHandler: () => () => {},
    getActiveTool: () => ({ id: 'pointer', enables: new Set(['form-fill']) }),
  };
  const ctx = createTestContext({
    id: 'form',
    state: initialFormState(),
    capabilities: [[InteractionToken, interaction]],
    doc: {
      forms: { list, setValue },
      security: { allows: (capability: string) => granted.includes(capability) },
    } as never,
  });
  return { capability: ctx.connect(createFormController(ctx)), list, setValue };
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

  it('without fill authority every fill item renders disabled', async () => {
    const fixture = harness(['doc.forms.read']);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    expect(fixture.capability.getFillItem(9)?.disabled).toBe(true);
  });

  it('with fill authority the field flags alone decide', async () => {
    const fixture = harness(ALL);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    expect(fixture.capability.getFillItem(9)?.disabled).toBe(false);
  });

  it('refuses writes with the engine refusal shape before any engine call', async () => {
    const fixture = harness(['doc.forms.read']);
    await fixture.capability.refresh();
    await vi.waitFor(() => expect(fixture.capability.getSnapshot()).not.toBeNull());
    await expect(fixture.capability.setText(fieldRef.byObjectNumber(5), 'x')).rejects.toMatchObject(
      {
        code: 'permission-denied',
      },
    );
    await expect(fixture.capability.reset(fieldRef.byObjectNumber(5))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(fixture.setValue).not.toHaveBeenCalled();
  });
});
