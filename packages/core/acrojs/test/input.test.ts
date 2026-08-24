import { describe, expect, it } from 'vitest';
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';

import { scriptFieldsFromSnapshot } from '../src/input';

function snapshotWith(field: FormFieldDTO): FormSnapshot {
  return { fields: [field], calculationOrder: [] } as FormSnapshot;
}

describe('scriptFieldsFromSnapshot', () => {
  it.each(['checkbox', 'radio'] as const)(
    'exposes an absent %s value and default as Acrobat Off tokens',
    (family) => {
      const field = {
        ref: { kind: 'objectNumber', fieldObjectNumber: 5 },
        name: 'toggle',
        family,
        valueEntry: { kind: 'none' },
        defaultValueEntry: { kind: 'none' },
        flags: { readOnly: false, required: false },
      } as FormFieldDTO;

      expect(scriptFieldsFromSnapshot(snapshotWith(field))[0]).toMatchObject({
        value: 'Off',
        defaultValue: 'Off',
      });
    },
  );

  it('keeps an absent text value as null', () => {
    const field = {
      ref: { kind: 'objectNumber', fieldObjectNumber: 6 },
      name: 'text',
      family: 'text',
      valueEntry: { kind: 'none' },
      defaultValueEntry: { kind: 'none' },
      flags: { readOnly: false, required: false },
    } as FormFieldDTO;

    expect(scriptFieldsFromSnapshot(snapshotWith(field))[0]).toMatchObject({
      value: null,
      defaultValue: null,
    });
  });
});
