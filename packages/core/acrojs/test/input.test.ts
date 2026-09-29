import { describe, expect, it } from 'vitest';
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';

import { scriptFieldsFromSnapshot } from '../src/input';

function snapshotWith(field: FormFieldDTO): FormSnapshot {
  return { formKind: 'acroform', needsAppearances: false, fields: [field], calculationOrder: [] };
}

describe('scriptFieldsFromSnapshot', () => {
  it.each(['checkbox', 'radio'] as const)(
    'exposes an absent %s value and default as Acrobat Off tokens',
    (family) => {
      const field = {
        ref: { kind: 'objectNumber', objectNumber: 5 },
        name: 'toggle',
        family,
        valueEntry: { kind: 'none' },
        defaultValueEntry: { kind: 'none' },
        readOnly: false,
        required: false,
        widgets: [],
      } as unknown as FormFieldDTO;

      expect(scriptFieldsFromSnapshot(snapshotWith(field))[0]).toMatchObject({
        value: 'Off',
        defaultValue: 'Off',
      });
    },
  );

  it("shows a toggle's export value, not its on-state name", () => {
    const widget = (onState: string, exportValue: string) => ({ onState, exportValue });
    const field = {
      ref: { kind: 'objectNumber', objectNumber: 7 },
      name: 'size',
      family: 'radio',
      valueEntry: { kind: 'scalar', value: '1' },
      defaultValueEntry: { kind: 'scalar', value: '0' },
      readOnly: false,
      required: false,
      widgets: [widget('0', 'Small'), widget('1', 'Large')],
    } as unknown as FormFieldDTO;

    expect(scriptFieldsFromSnapshot(snapshotWith(field))[0]).toMatchObject({
      value: 'Large',
      defaultValue: 'Small',
      exportValues: ['Small', 'Large'],
    });
  });

  it('keeps an absent text value as null', () => {
    const field = {
      ref: { kind: 'objectNumber', objectNumber: 6 },
      name: 'text',
      family: 'text',
      valueEntry: { kind: 'none' },
      defaultValueEntry: { kind: 'none' },
      readOnly: false,
      required: false,
    } as FormFieldDTO;

    expect(scriptFieldsFromSnapshot(snapshotWith(field))[0]).toMatchObject({
      value: null,
      defaultValue: null,
    });
  });
});
