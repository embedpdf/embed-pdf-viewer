import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import {
  fieldByRef,
  fieldsNamedBy,
  indexFields,
  predictFormOp,
  restoresOf,
  widgetRowOf,
  withFieldsFrom,
  type FieldIndex,
} from '../src/model';

const PAGE = toPageRef(3);

const base = {
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
} as const;

const name: FormFieldDTO = {
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 4 },
  name: 'name',
  family: 'text',
  valueEntry: { kind: 'scalar', value: 'abc' },
  defaultValueEntry: { kind: 'scalar', value: 'start' },
  widgets: [formWidget(5, PAGE)],
  value: 'abc',
  defaultValue: 'start',
  maxLength: 5,
  multiline: false,
  password: false,
  comb: false,
};

const toggle = (objectNumber: number, onState: string) => ({
  ...formWidget(objectNumber, PAGE),
  onState,
  exportValue: onState,
  checked: false,
});

/** One checkbox shown twice: both widgets check together. */
const agree: FormFieldDTO = {
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 10 },
  name: 'agree',
  family: 'checkbox',
  valueEntry: { kind: 'scalar', value: 'Off' },
  defaultValueEntry: { kind: 'none' },
  checked: false,
  exportValue: 'Yes',
  widgets: [toggle(11, 'Yes'), toggle(12, 'Yes')],
};

const size: FormFieldDTO = {
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 20 },
  name: 'size',
  family: 'radio',
  valueEntry: { kind: 'scalar', value: 'Off' },
  defaultValueEntry: { kind: 'scalar', value: 'L' },
  value: 'Off',
  radiosInUnison: false,
  noToggleToOff: false,
  widgets: [toggle(21, 'S'), toggle(22, 'L')],
};

const send: FormFieldDTO = {
  ...base,
  ref: { kind: 'objectNumber', objectNumber: 30 },
  name: 'send',
  family: 'pushbutton',
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [formWidget(31, PAGE)],
};

const row = (objectNumber: number, over: Partial<WidgetAnnotation> = {}): WidgetAnnotation =>
  ({
    subtype: 'widget',
    ref: { kind: 'objectNumber', page: PAGE, objectNumber },
    page: PAGE,
    rect: { x: objectNumber, y: 0, width: 10, height: 10 },
    hasAppearance: true,
    appearanceState: null,
    hidden: false,
    invisible: false,
    noView: false,
    print: true,
    ...over,
  }) as unknown as WidgetAnnotation;

const form = (): FieldIndex =>
  indexFields({
    formKind: 'acroform',
    needsAppearances: false,
    fields: [name, agree, size, send],
    widgets: [
      row(5, { hasAppearance: false }),
      row(11, { appearanceState: 'Off' }),
      row(12, { appearanceState: 'Off' }),
      row(21, { appearanceState: 'Off' }),
      row(22, { appearanceState: 'Off' }),
      row(31),
    ],
    calculationOrder: [],
  } as unknown as FormSnapshot);

const field = (index: FieldIndex, objectNumber: number) =>
  fieldByRef(index, { kind: 'objectNumber', objectNumber }) as FormFieldDTO &
    Record<string, unknown>;

describe('predictFormOp', () => {
  test('a value shows on its field and draws its widgets', () => {
    const next = predictFormOp(form(), {
      type: 'forms.setValue',
      field: { kind: 'fqn', name: 'name' },
      value: { value: 'hello world' },
    });
    // Cut to the field's maximum length, as the engine does.
    expect(field(next, 4).value).toBe('hello');
    expect(widgetRowOf(next, 5)?.hasAppearance).toBe(true);
  });

  test('the same op over the same form gives the same form, every time the view replays it', () => {
    const index = form();
    const op = { type: 'forms.setValue', field: name.ref, value: { value: 'x' } } as const;
    const once = predictFormOp(index, op);
    expect(predictFormOp(index, op)).toBe(once);
    expect(fieldByRef(predictFormOp(index, op), name.ref)).toBe(fieldByRef(once, name.ref));
  });

  test('a checkbox checks every widget it shows in', () => {
    const next = predictFormOp(form(), {
      type: 'forms.setValue',
      field: agree.ref,
      value: { checked: true },
    });
    expect(field(next, 10).checked).toBe(true);
    expect(widgetRowOf(next, 11)?.appearanceState).toBe('Yes');
    expect(widgetRowOf(next, 12)?.appearanceState).toBe('Yes');
  });

  test('a reset puts back the fields it names, or every field that holds a value', () => {
    const filled = predictFormOp(
      predictFormOp(form(), { type: 'forms.setValue', field: agree.ref, value: { checked: true } }),
      { type: 'forms.setValue', field: name.ref, value: { value: 'x' } },
    );
    const named = predictFormOp(filled, { type: 'forms.reset', fields: [name.ref] });
    expect(field(named, 4).value).toBe('start');
    expect(field(named, 10).checked).toBe(true);

    const all = predictFormOp(filled, { type: 'forms.reset' });
    expect(field(all, 4).value).toBe('start');
    expect(field(all, 10).checked).toBe(false);
    expect(field(all, 20).value).toBe('L');
    expect(widgetRowOf(all, 22)?.appearanceState).toBe('L');
  });

  test('what the engine would refuse shows nothing', () => {
    const index = form();
    // A checkbox doesn't take text it has no widget for, and a push button has no default.
    expect(
      predictFormOp(index, { type: 'forms.setValue', field: agree.ref, value: { value: 'No' } }),
    ).toBe(index);
    expect(predictFormOp(index, { type: 'forms.reset', fields: [name.ref, send.ref] })).toBe(index);
    expect(
      predictFormOp(index, {
        type: 'forms.setValue',
        field: { kind: 'fqn', name: 'missing' },
        value: { value: 'x' },
      }),
    ).toBe(index);
  });

  test('display shows on the widget flags; other planes are left alone', () => {
    const index = form();
    const hidden = predictFormOp(index, {
      type: 'forms.setDisplay',
      field: agree.ref,
      display: 'hidden',
    });
    expect(widgetRowOf(hidden, 11)?.hidden).toBe(true);
    expect(widgetRowOf(hidden, 12)?.hidden).toBe(true);
    expect(predictFormOp(index, { type: 'metadata.update', patch: {} } as never)).toBe(index);
  });

  test('an undo look puts the field and its widgets back as they were', () => {
    const before = form();
    const ops = [
      { type: 'forms.setValue', field: agree.ref, value: { checked: true } },
      { type: 'forms.setValue', field: name.ref, value: { value: 'x' } },
      { type: 'forms.setDisplay', field: agree.ref, display: 'hidden' },
    ] as const;
    const after = ops.reduce(predictFormOp, before);
    const undo = restoresOf(before, ops);
    // Each field once, in op order.
    expect(undo.map((op) => op.type === 'forms.restore' && op.field.name)).toEqual([
      'agree',
      'name',
    ]);
    const undone = undo.reduce(predictFormOp, after);
    expect(field(undone, 10).checked).toBe(false);
    expect(field(undone, 4).value).toBe('abc');
    expect(widgetRowOf(undone, 11)).toEqual(widgetRowOf(before, 11));
    expect(widgetRowOf(undone, 5)).toEqual(widgetRowOf(before, 5));
  });

  test('a restored widget comes back with its field', () => {
    const index = form();
    const gone = indexFields({
      ...index.snapshot!,
      widgets: index.snapshot!.widgets.filter((candidate) => candidate !== widgetRowOf(index, 12)),
    });
    const back = predictFormOp(gone, {
      type: 'forms.restoreWidget',
      widget: widgetRowOf(index, 12)!,
      field: agree,
    });
    expect(widgetRowOf(back, 12)).toEqual(widgetRowOf(index, 12));
  });
});

describe('the fields a fill names', () => {
  test('a whole-form reset names every field that holds a value', () => {
    expect(fieldsNamedBy(form(), [{ type: 'forms.reset' }]).map((each) => each.name)).toEqual([
      'name',
      'agree',
      'size',
    ]);
  });

  test('withFieldsFrom takes fields and their widgets from another form', () => {
    const before = form();
    const after = predictFormOp(before, {
      type: 'forms.setValue',
      field: agree.ref,
      value: { checked: true },
    });
    const back = withFieldsFrom(after, before, [agree]);
    expect(field(back, 10).checked).toBe(false);
    expect(widgetRowOf(back, 11)?.appearanceState).toBe('Off');
  });
});
