import { describe, expect, test } from 'vitest';

import {
  FormFieldDTOSchema,
  FormFieldValueSchema,
  FormSnapshotSchema,
} from '../../src/forms/schema';
import type { FormFieldDTO, FormSnapshot } from '../../src/shared';

const BASE = {
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
} as const;

const RADIO: FormFieldDTO = {
  ...BASE,
  ref: { kind: 'objectNumber', objectNumber: 6 },
  name: 'gender',
  family: 'radio',
  valueEntry: { kind: 'scalar', value: 'male' },
  defaultValueEntry: { kind: 'none' },
  value: 'male',
  radiosInUnison: false,
  noToggleToOff: false,
  widgets: [
    {
      ref: {
        kind: 'objectNumber',
        page: { kind: 'objectNumber', objectNumber: 3 },
        objectNumber: 8,
      },
      objectNumber: 8,
      page: { kind: 'objectNumber', objectNumber: 3 },
      onState: 'male',
      exportValue: 'male',
      checked: true,
    },
    {
      ref: {
        kind: 'objectNumber',
        page: { kind: 'objectNumber', objectNumber: 3 },
        objectNumber: 9,
      },
      objectNumber: 9,
      page: { kind: 'objectNumber', objectNumber: 3 },
      onState: 'female',
      exportValue: 'female',
      checked: false,
    },
  ],
};

const LISTBOX: FormFieldDTO = {
  ...BASE,
  ref: { kind: 'objectNumber', objectNumber: 9 },
  name: 'fruits',
  family: 'listbox',
  valueEntry: { kind: 'array', values: ['Apple', 'Cherry'] },
  defaultValueEntry: { kind: 'array', values: ['Apple'] },
  selectedValues: ['Apple', 'Cherry'],
  defaultValue: ['Apple'],
  multiSelect: true,
  options: [
    { label: 'Apple', value: 'Apple', selected: true },
    { label: 'Banana', value: 'Banana', selected: false },
    { label: 'Cherry', value: 'Cherry', selected: true },
  ],
  widgets: [
    {
      ref: {
        kind: 'objectNumber',
        page: { kind: 'objectNumber', objectNumber: 3 },
        objectNumber: 9,
      },
      objectNumber: 9,
      page: { kind: 'objectNumber', objectNumber: 3 },
    },
  ],
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
      widgets: [],
      calculationOrder: [RADIO.ref, null, LISTBOX.ref],
    };
    expect(FormSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  test('values parse in the shapes a read has, and nothing else', () => {
    expect(FormFieldValueSchema.parse({ value: 'Bob' })).toEqual({ value: 'Bob' });
    expect(FormFieldValueSchema.parse({ value: null })).toEqual({ value: null });
    expect(FormFieldValueSchema.parse({ checked: true })).toEqual({ checked: true });
    expect(FormFieldValueSchema.parse({ selectedValues: ['A', 'B'] })).toEqual({
      selectedValues: ['A', 'B'],
    });
    expect(() => FormFieldValueSchema.parse({ type: 'text', value: 'A' })).toThrow();
    expect(() => FormFieldValueSchema.parse({ value: 'A', checked: true })).toThrow();
    expect(() => FormFieldValueSchema.parse({ selectedValues: 'A' })).toThrow();
  });
});
