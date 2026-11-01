/**
 * The `fillable` setting: which fields people may fill in by hand. A field it
 * leaves out draws disabled, as a read-only field does; `canFill()` and the
 * fills stated in code don't change.
 */
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

import { FORM_DEFAULTS, type FormConfig } from '../src/contract';
import { createFormController } from '../src/controller';
import { initialFormModel } from '../src/model';

const PAGE = toPageRef(1);
const FIELD = { kind: 'objectNumber' as const, objectNumber: 5 };

const textField: FormFieldDTO = {
  ref: FIELD,
  name: 'name',
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
  widgets: [formWidget(9, PAGE)],
  value: '',
  defaultValue: '',
  maxLength: null,
  multiline: false,
  password: false,
  comb: false,
};

const snapshot: FormSnapshot = {
  formKind: 'acroform',
  needsAppearances: false,
  widgets: [
    {
      subtype: 'widget',
      ref: { kind: 'objectNumber', page: PAGE, objectNumber: 9 },
      page: PAGE,
      rect: { x: 0, y: 0, width: 100, height: 20 },
    } as unknown as WidgetAnnotation,
  ],
  fields: [textField],
  calculationOrder: [],
};

/** A form with one text field the session may fill in, read and loaded. */
async function loaded(config?: FormConfig) {
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
      security: { allows: () => true, allowsField: () => true },
    } as never,
  });
  const capability = ctx.connect(createFormController(ctx));
  await capability.refresh();
  await vi.waitFor(() => expect(capability.getSnapshot()).not.toBeNull());
  await capability.ensureLoaded(PAGE);
  return { capability, apply };
}

const disabled = (capability: Awaited<ReturnType<typeof loaded>>['capability']) =>
  capability.listWidgets(PAGE).map((item) => item.disabled);

describe('the fillable setting', () => {
  it('lets people fill in every field by default', async () => {
    const { capability } = await loaded();
    expect(capability.getSettings().fillable).toBe(true);
    expect(disabled(capability)).toEqual([false]);
  });

  it('draws a field it leaves out disabled, while canFill and code still fill it in', async () => {
    const { capability, apply } = await loaded({ fillable: false });
    expect(disabled(capability)).toEqual([true]);
    expect(capability.canFill(FIELD)).toBe(true);
    await capability.setValue(FIELD, { value: 'from code' });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('takes a list of field families, and follows updateSettings', async () => {
    const { capability } = await loaded({ fillable: ['checkbox', 'signature'] });
    expect(disabled(capability)).toEqual([true]);
    capability.updateSettings({ fillable: ['text'] });
    expect(disabled(capability)).toEqual([false]);
    capability.updateSettings({ fillable: false });
    expect(disabled(capability)).toEqual([true]);
    capability.resetSettings();
    expect(disabled(capability)).toEqual([true]);
  });
});
