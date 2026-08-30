import { describe, expect, it, vi } from 'vitest';
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';
import type { PluginContext } from '@embedpdf/core';

import { createFormCapability } from '../src/capability';
import { formReducer, initialFormState } from '../src/reducer';
import type { FormAction, FormState } from '../src/types';

const field = (): FormFieldDTO => ({
  ref: { kind: 'objectNumber', fieldObjectNumber: 5 },
  fieldObjectNumber: 5,
  name: 'name',
  family: 'text',
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 0 },
  alternateName: null,
  mappingName: null,
  widgets: [{ annotObjectNumber: 9, pageObjectNumber: 1 }],
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
};

function harness(granted: readonly string[]) {
  let state = initialFormState();
  const list = vi.fn(async () => SNAPSHOT);
  const setValue = vi.fn(async () => ({ changedWidgets: [] }));
  const ctx = {
    getState: () => state,
    dispatch: (action: FormAction) => {
      state = formReducer(state, action);
    },
    document: () => ({ pages: [] }),
    doc: {
      forms: { list, setValue },
      security: { allows: (cap: string) => granted.includes(cap) },
    },
    cleanup: () => {},
    tryGet: () => null,
  } as unknown as PluginContext<FormState, FormAction>;
  return { capability: createFormCapability(ctx), list, setValue };
}

const ALL = ['doc.forms.read', 'doc.forms.fill', 'doc.forms.modify'];

describe('the twin law (PERMISSIONS.md) — form', () => {
  it('the three twins mirror their capabilities independently', () => {
    const h = harness(['doc.forms.read', 'doc.forms.fill']);
    expect(h.capability.canRead()).toBe(true);
    expect(h.capability.canFill()).toBe(true);
    expect(h.capability.canDesign()).toBe(false);
  });

  it('no read authority → hydration never fires the doomed list', async () => {
    const h = harness(['doc.forms.fill']);
    await h.capability.refresh();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.capability.snapshot()).toBeNull();
  });

  it('fill authority fuses into FillItem.disabled — inert pixels, not a late 403', async () => {
    const h = harness(['doc.forms.read']);
    await h.capability.refresh();
    await vi.waitFor(() => expect(h.capability.snapshot()).not.toBeNull());
    expect(h.capability.fillItem(9)?.disabled).toBe(true);
  });

  it('a fillable session leaves the flag gate in charge', async () => {
    const h = harness(ALL);
    await h.capability.refresh();
    await vi.waitFor(() => expect(h.capability.snapshot()).not.toBeNull());
    expect(h.capability.fillItem(9)?.disabled).toBe(false);
  });

  it('the write gate refuses with the engine refusal shape, before any call', async () => {
    const h = harness(['doc.forms.read']);
    await h.capability.refresh();
    await vi.waitFor(() => expect(h.capability.snapshot()).not.toBeNull());
    await expect(h.capability.setText('obj:5', 'x')).rejects.toMatchObject({
      name: 'PermissionDenied',
      required: 'doc.forms.fill',
    });
    await expect(h.capability.reset('obj:5')).rejects.toMatchObject({
      name: 'PermissionDenied',
    });
    expect(h.setValue).not.toHaveBeenCalled();
  });
});
