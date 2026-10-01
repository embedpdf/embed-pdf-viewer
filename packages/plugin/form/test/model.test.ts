import { describe, expect, test } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
} from '@embedpdf/engine-core/runtime';

import { reload } from '@embedpdf/core';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';

import {
  beginWrite,
  emptyFieldIndex,
  endWrite,
  fieldByKey,
  fieldByRef,
  fieldForWidget,
  fieldKeyOf,
  foldFormEvent,
  indexFields,
  initialFormState,
  widgetAt,
  type FieldIndex,
  type FormWidgetLook,
  type PageWidgets,
} from '../src/model';
import { fillItems, projectWidget } from '../src/read/fill-items';

const text = (over: Partial<Extract<FormFieldDTO, { family: 'text' }>> = {}): FormFieldDTO => ({
  ref: { kind: 'objectNumber', objectNumber: 4 },
  name: 'maxlen_text',
  family: 'text',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'scalar', value: over.value ?? 'abc' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [{ ...formWidget(4, toPageRef(3)), rect: null }],
  value: 'abc',
  defaultValue: '',
  maxLength: 5,
  multiline: false,
  password: false,
  comb: false,
  ...over,
});

const snapshot = (fields: FormFieldDTO[]): FormSnapshot =>
  ({ formKind: 'acroform', needsAppearances: false, fields, calculationOrder: [] }) as FormSnapshot;

const origin = { kind: 'remote', sessionId: 'them', sub: null, ts: 0, serverId: null };
const event = (value: object) => ({ origin, ...value }) as unknown as DocumentEvent;
const NO_WRITES = {};
const LOOK: FormWidgetLook = {
  border: '#6b7280',
  borderWidth: 1,
  borderStyle: 'solid',
  background: '#ffffff',
  color: null,
  fontFamily: 'helvetica',
  fontSize: 12,
  textAlign: 'left',
};
const placed = (box: { x: number; y: number; width: number; height: number }) => ({ box, look: LOOK });
const BOXES: PageWidgets = { 4: placed({ x: 10, y: 20, width: 200, height: 24 }) };

describe('field index', () => {
  test('finds a field by the name a toFieldRef(name) carries', () => {
    const index = indexFields(snapshot([text()]));
    expect(fieldByRef(index, { kind: 'fqn', name: 'maxlen_text' })?.ref).toEqual({
      kind: 'objectNumber',
      objectNumber: 4,
    });
    expect(fieldByRef(index, { kind: 'fqn', name: 'missing' })).toBeNull();
  });

  test('indexes fields by key and by widget', () => {
    const index = indexFields(snapshot([text()]));
    expect(fieldByKey(index, 'obj:4')?.name).toBe('maxlen_text');
    expect(fieldForWidget(index, 4)?.name).toBe('maxlen_text');
    expect(fieldKeyOf(text())).toBe('obj:4');
  });

  test('folds value, structural and batch events from their data', () => {
    let index: FieldIndex = indexFields(snapshot([text()]));
    index = foldFormEvent(
      index,
      event({
        type: 'forms.valueSet',
        field: text({ value: 'abcde' }),
        meta: { changedWidgets: [] },
      }),
    ) as FieldIndex;
    expect((fieldByKey(index, 'obj:4') as { value: string }).value).toBe('abcde');

    const other = text({
      ref: { kind: 'objectNumber', objectNumber: 7 },
      name: 'other',
      widgets: [{ ...formWidget(8, toPageRef(3)), rect: null }],
    });
    index = foldFormEvent(index, event({ type: 'forms.created', field: other })) as FieldIndex;
    expect(fieldForWidget(index, 8)?.name).toBe('other');

    index = foldFormEvent(
      index,
      event({
        type: 'forms.effectsApplied',
        results: [
          { index: 0, status: 'applied', fields: [text({ value: 'script' })], changedWidgets: [] },
        ],
        meta: { changedFields: [], changedWidgets: [] },
      }),
    ) as FieldIndex;
    expect((fieldByKey(index, 'obj:4') as { value: string }).value).toBe('script');

    index = foldFormEvent(
      index,
      event({
        type: 'forms.deleted',
        deleted: { kind: 'objectNumber', objectNumber: 7 },
        meta: {
          changedFields: [{ kind: 'objectNumber', objectNumber: 7 }],
          changedWidgets: [],
        },
      }),
    ) as FieldIndex;
    expect(fieldForWidget(index, 8)).toBeNull();
  });

  test('the first field of a document without a form creates an AcroForm', () => {
    const empty = indexFields({ ...snapshot([]), formKind: 'none' });
    const index = foldFormEvent(
      empty,
      event({ type: 'forms.created', field: text() }),
    ) as FieldIndex;
    expect(index.snapshot?.formKind).toBe('acroform');
    expect(fieldByKey(index, 'obj:4')).not.toBeNull();
  });

  test('a repair is too coarse to fold and asks for a reload', () => {
    const index = indexFields(snapshot([text()]));
    expect(foldFormEvent(index, event({ type: 'forms.repaired' }))).toEqual(reload());
    expect(foldFormEvent(emptyFieldIndex(), event({ type: 'metadata.updated' }))).toEqual(
      emptyFieldIndex(),
    );
  });

  test('in-flight writes are tracked per field', () => {
    let state = beginWrite(initialFormState(), 'obj:4');
    expect(state.writing['obj:4']).toBe(true);
    state = endWrite(state, 'obj:4');
    expect(state.writing['obj:4']).toBeUndefined();
    expect(endWrite(state, 'obj:4')).toBe(state);
  });
});

describe('fill projection', () => {
  test('joins the field plane with widget geometry', () => {
    const index = indexFields(snapshot([text()]));
    expect(fillItems(index, 3, undefined, NO_WRITES)).toEqual([]);
    const items = fillItems(index, 3, BOXES, NO_WRITES);
    expect(items.length).toBe(1);
    const item = items[0]!;
    expect(item.control).toBe('text');
    expect(item.box).toEqual({ x: 10, y: 20, width: 200, height: 24 });
    expect(item.look).toBe(LOOK);
    if (item.control === 'text') {
      expect(item.value).toBe('abc');
      expect(item.maxLength).toBe(5);
    }
    expect(fillItems(index, 99, BOXES, NO_WRITES)).toEqual([]);
  });


  test('read-only and in-flight fields project as disabled', () => {
    const readOnly = text({ readOnly: true });
    expect(fillItems(indexFields(snapshot([readOnly])), 3, BOXES, NO_WRITES)[0]!.disabled).toBe(
      true,
    );
    const writing = beginWrite(initialFormState(), 'obj:4').writing;
    expect(fillItems(indexFields(snapshot([text()])), 3, BOXES, writing)[0]!.disabled).toBe(true);
  });
});

const signature = (
  over: Partial<Extract<FormFieldDTO, { family: 'signature' }>> = {},
): FormFieldDTO => ({
  ref: { kind: 'objectNumber', objectNumber: 9 },
  name: 'sig',
  family: 'signature',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: 'Sign here',
  mappingName: null,
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [{ ...formWidget(9, toPageRef(3)), rect: null }],
  ...over,
});

describe('signature widgets', () => {
  test('an unsigned signature field projects a "signature" fill item', () => {
    const item = projectWidget(signature(), 9, NO_WRITES, BOXES[4]!);
    expect(item).toMatchObject({ control: 'signature', signed: false, label: 'Sign here' });
  });

  test('a /V on the field marks the item signed', () => {
    const signed = signature({ valueEntry: { kind: 'unsupported' } });
    expect(projectWidget(signed, 9, NO_WRITES, BOXES[4]!)).toMatchObject({
      control: 'signature',
      signed: true,
    });
  });

  test('widgetAt resolves the smallest containing widget from loaded geometry', () => {
    const index = indexFields(
      snapshot([text(), signature({ widgets: [{ ...formWidget(9, toPageRef(3)), rect: null }] })]),
    );
    expect(widgetAt(index, undefined, { x: 10, y: 10 })).toBeNull();
    const boxes = {
      4: placed({ x: 0, y: 0, width: 200, height: 200 }),
      9: placed({ x: 50, y: 50, width: 40, height: 20 }),
    };
    expect(widgetAt(index, boxes, { x: 60, y: 60 })).toMatchObject({
      annotObjectNumber: 9,
      field: { name: 'sig' },
    });
    expect(widgetAt(index, boxes, { x: 10, y: 10 })).toMatchObject({ annotObjectNumber: 4 });
    expect(widgetAt(index, boxes, { x: 500, y: 500 })).toBeNull();
  });
});
