import { describe, expect, test } from 'vitest';

import {
  FormFieldDTOSchema,
  FormFieldDraftSchema,
  FormFieldFormatSchema,
  FormFieldPatchSchema,
  FormFieldValueSchema,
  FormSnapshotSchema,
  WidgetPlacementSchema,
} from '../../src/forms/schema';
import type { FormField, FormSnapshot } from '../../src/shared';

const BASE = {
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

const RADIO: FormField = {
  ...BASE,
  ref: { kind: 'objectNumber', objectNumber: 6 },
  name: 'gender',
  kind: 'radio',
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

const LISTBOX: FormField = {
  ...BASE,
  ref: { kind: 'objectNumber', objectNumber: 9 },
  name: 'fruits',
  kind: 'listbox',
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
  topIndex: 0,
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
    const bad = { ...LISTBOX, kind: 'text' };
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

  test('a widget placement takes a dash pattern of at least one length', () => {
    const placement = {
      page: { kind: 'objectNumber', objectNumber: 3 },
      rect: { x: 72, y: 72, width: 120, height: 24 },
      borderStyle: 'dashed',
    };
    expect(WidgetPlacementSchema.safeParse({ ...placement, dashArray: [6, 3] }).success).toBe(true);
    expect(WidgetPlacementSchema.safeParse({ ...placement, dashArray: null }).success).toBe(true);
    expect(WidgetPlacementSchema.safeParse({ ...placement, dashArray: [] }).success).toBe(false);
  });

  test('a draft and a patch take a group, or null for none, and no empty id', () => {
    const draft = { kind: 'text', name: 'note' };
    for (const schema of [FormFieldDraftSchema, FormFieldPatchSchema]) {
      expect(schema.safeParse(draft).success).toBe(true);
      expect(schema.safeParse({ ...draft, groupId: 'buyer' }).success).toBe(true);
      expect(schema.safeParse({ ...draft, groupId: null }).success).toBe(true);
      expect(schema.safeParse({ ...draft, groupId: '' }).success).toBe(false);
      expect(schema.safeParse({ ...draft, groupId: 'g'.repeat(257) }).success).toBe(false);
    }
    expect(FormFieldPatchSchema.parse({ groupId: null })).toEqual({ groupId: null });
  });

  test('a draft and a patch take a purpose, or null for none, and none with space around it', () => {
    const draft = { kind: 'signature', name: 'sign' };
    for (const schema of [FormFieldDraftSchema, FormFieldPatchSchema]) {
      expect(schema.safeParse({ ...draft, purpose: 'signature' }).success).toBe(true);
      expect(schema.safeParse({ ...draft, purpose: 'p'.repeat(256) }).success).toBe(true);
      expect(schema.safeParse({ ...draft, purpose: null }).success).toBe(true);
      for (const purpose of ['', ' name', 'name ', 'p'.repeat(257), 'billing\u0000account', 5]) {
        expect(schema.safeParse({ ...draft, purpose }).success).toBe(false);
      }
    }
    expect(FormFieldPatchSchema.parse({ purpose: null })).toEqual({ purpose: null });
  });

  test('a text field and a dropdown take a date or a time format, with a pattern that is one', () => {
    const date = { kind: 'date', pattern: 'dd/mm/yyyy' };
    for (const kind of ['text', 'combobox']) {
      const draft = { kind, name: 'when' };
      expect(FormFieldDraftSchema.safeParse({ ...draft, format: date }).success).toBe(true);
      expect(FormFieldDraftSchema.safeParse({ ...draft, format: null }).success).toBe(true);
      expect(
        FormFieldDraftSchema.safeParse({ ...draft, format: { kind: 'time', pattern: 'HH:MM' } })
          .success,
      ).toBe(true);
      for (const format of [
        { kind: 'other' },
        { kind: 'number', pattern: '0.00' },
        { kind: 'date' },
        { kind: 'date', pattern: '' },
        { kind: 'date', pattern: 'dddd' },
        { kind: 'date', pattern: 'd");x("' },
        { kind: 'date', pattern: `dd${' '.repeat(59)}yyyy` },
        { kind: 'date', pattern: 'yyyy/mm/mm/dd' },
        { kind: 'date', pattern: 'dd/mm', script: 'x' },
        // A pattern of the other kind.
        { kind: 'date', pattern: 'HH:MM' },
        { kind: 'time', pattern: 'dd/mm/yyyy' },
        { kind: 'time', pattern: 'm/d/yy HH:MM' },
        { kind: 'time', pattern: 'HH.MM' },
        'dd/mm/yyyy',
      ]) {
        expect(FormFieldDraftSchema.safeParse({ ...draft, format }).success).toBe(false);
        expect(FormFieldPatchSchema.safeParse({ format }).success).toBe(false);
      }
    }
    // Another kind's draft has no format; a patch names no kind, so the engine refuses it there.
    for (const kind of ['checkbox', 'radio', 'listbox', 'pushbutton', 'signature']) {
      expect(FormFieldDraftSchema.safeParse({ kind, name: 'x', format: date }).success).toBe(false);
    }
    expect(FormFieldPatchSchema.parse({ format: null })).toEqual({ format: null });
    expect(FormFieldPatchSchema.parse({ format: date })).toEqual({ format: date });
  });

  test('a response carries a format of a kind this client knows, or reads it as other', () => {
    expect(FormFieldFormatSchema.parse({ kind: 'date', pattern: 'm/d' })).toEqual({
      kind: 'date',
      pattern: 'm/d',
    });
    expect(FormFieldFormatSchema.parse({ kind: 'other' })).toEqual({ kind: 'other' });
    // A kind a later server adds, with whatever it carries.
    expect(FormFieldFormatSchema.parse({ kind: 'number', decimals: 2 })).toEqual({ kind: 'other' });
    // A kind this client knows still has to be whole.
    expect(FormFieldFormatSchema.safeParse({ kind: 'date' }).success).toBe(false);
  });

  test('a field from a server older than purpose and format reads whole', () => {
    const script = (source: string) => ({
      root: { type: 'javascript', subtype: 'JavaScript', script: source, next: [] },
      incomplete: false,
      warnings: [],
    });
    const text = {
      ...BASE,
      ref: { kind: 'objectNumber', objectNumber: 4 },
      name: 'when',
      kind: 'text',
      valueEntry: { kind: 'none' },
      defaultValueEntry: { kind: 'none' },
      value: '',
      defaultValue: '',
      maxLength: null,
      multiline: false,
      password: false,
      comb: false,
      widgets: [],
    };
    const { purpose: _purpose, ...older } = text;
    // No purpose, since such a server reads none; the format its scripts give.
    expect(FormFieldDTOSchema.parse(older)).toEqual({ ...text, purpose: null, format: null });
    const dated = {
      ...older,
      actions: {
        format: script('AFDate_FormatEx("dd/mm/yyyy");'),
        keystroke: script('AFDate_KeystrokeEx("dd/mm/yyyy");'),
      },
    };
    expect(FormFieldDTOSchema.parse(dated)).toMatchObject({
      purpose: null,
      format: { kind: 'date', pattern: 'dd/mm/yyyy' },
    });
    expect(
      FormFieldDTOSchema.parse({ ...older, actions: { format: script('event.value = 1;') } }),
    ).toMatchObject({ format: { kind: 'other' } });
    // What a server of this version sends is read as it is sent.
    const sent = { ...dated, purpose: 'date-signed', format: null };
    expect(FormFieldDTOSchema.parse(sent)).toMatchObject({ purpose: 'date-signed', format: null });
    // A kind without a format gets none, and keeps its own members.
    const { purpose: _radioPurpose, ...olderRadio } = RADIO;
    const radio = FormFieldDTOSchema.parse(olderRadio);
    expect(radio).toEqual(RADIO);
    expect('format' in radio).toBe(false);
    // A kind this client doesn't know reads as `unknown`, with no purpose either.
    expect(FormFieldDTOSchema.parse({ ...older, kind: 'barcode' })).toMatchObject({
      kind: 'unknown',
      purpose: null,
      rawValue: '',
    });
  });
});
