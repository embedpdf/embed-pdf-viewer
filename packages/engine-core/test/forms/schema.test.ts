import { describe, expect, test } from 'vitest';

import {
  FormFieldDTOSchema,
  FormFieldValueSchema,
  FormSnapshotSchema,
} from '../../src/forms/schema';
import type { FormFieldDTO, FormSnapshot } from '../../src/shared';

const BASE = {
  fieldObjectNumber: 6,
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 32768 },
  alternateName: null,
  mappingName: null,
} as const;

const RADIO: FormFieldDTO = {
  ...BASE,
  ref: { kind: 'objectNumber', fieldObjectNumber: 6 },
  name: 'gender',
  family: 'radio',
  valueEntry: { kind: 'scalar', value: 'male' },
  defaultValueEntry: { kind: 'none' },
  value: 'male',
  radiosInUnison: false,
  noToggleToOff: false,
  widgets: [
    {
      annotObjectNumber: 8,
      pageObjectNumber: 3,
      onState: 'male',
      exportValue: 'male',
      checked: true,
    },
    {
      annotObjectNumber: 9,
      pageObjectNumber: 3,
      onState: 'female',
      exportValue: 'female',
      checked: false,
    },
  ],
};

const LISTBOX: FormFieldDTO = {
  ...BASE,
  ref: { kind: 'objectNumber', fieldObjectNumber: 9 },
  fieldObjectNumber: 9,
  name: 'fruits',
  family: 'listbox',
  valueEntry: { kind: 'array', values: ['Apple', 'Cherry'] },
  defaultValueEntry: { kind: 'array', values: ['Apple'] },
  selectedValues: ['Apple', 'Cherry'],
  multiSelect: true,
  options: [
    { label: 'Apple', value: 'Apple', selected: true },
    { label: 'Banana', value: 'Banana', selected: false },
    { label: 'Cherry', value: 'Cherry', selected: true },
  ],
  widgets: [{ annotObjectNumber: 9, pageObjectNumber: 3 }],
};

describe('form schemas', () => {
  test('field DTO union round-trips per family', () => {
    expect(FormFieldDTOSchema.parse(RADIO)).toEqual(RADIO);
    expect(FormFieldDTOSchema.parse(LISTBOX)).toEqual(LISTBOX);
  });

  test('family discriminant rejects cross-family members', () => {
    // A listbox payload claiming to be text must fail: no `value` string,
    // and `selectedValues` is not part of the text member.
    const bad = { ...LISTBOX, family: 'text' };
    expect(() => FormFieldDTOSchema.parse(bad)).toThrow();
  });

  test('snapshot validates end to end', () => {
    const snapshot: FormSnapshot = {
      formKind: 'acroform',
      needsAppearances: false,
      fields: [RADIO, LISTBOX],
      calculationOrder: [RADIO.ref, null, LISTBOX.ref],
    };
    expect(FormSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  test('typed values parse and reject mismatched shapes', () => {
    expect(FormFieldValueSchema.parse({ type: 'text', value: 'Bob' })).toEqual({
      type: 'text',
      value: 'Bob',
    });
    expect(FormFieldValueSchema.parse({ type: 'toggle', state: null })).toEqual({
      type: 'toggle',
      state: null,
    });
    expect(FormFieldValueSchema.parse({ type: 'choice', values: ['A', 'B'] })).toEqual({
      type: 'choice',
      values: ['A', 'B'],
    });
    expect(() => FormFieldValueSchema.parse({ type: 'text', values: ['A'] })).toThrow();
  });
});
