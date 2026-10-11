import type { PredictedOp } from '@embedpdf/core';
import {
  formWidget,
  toPageRef,
  type FormFieldDTO,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';

import { fieldByRef, indexFields, widgetRowOf, type FieldIndex } from '../src/model';
import { fieldsNamedBy, predictFormOp, undoLookOf, withFieldsFrom } from '../src/sync/predict';

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
    box: { x: objectNumber, y: 0, width: 10, height: 10 },
    rotation: null,
    fieldFamily: 'text',
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
    const undo = undoLookOf(before, ops);
    // One restore per op, the last op's first.
    expect(undo.map((op) => op.type === 'forms.restore' && op.field.name)).toEqual([
      'agree',
      'name',
      'agree',
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

/**
 * The fields and widget rows of a form, keyed, with its calculation order and the widgets'
 * paint order. A restore puts a row back at the end, as the engine's restore event does, so
 * undo looks compare the content alone (`withoutOrder`).
 */
const contentOf = (index: FieldIndex) => ({
  fields: Object.fromEntries(
    (index.snapshot?.fields ?? []).map((each) => [JSON.stringify(each.ref), each]),
  ),
  widgets: Object.fromEntries(
    (index.snapshot?.widgets ?? []).map((each) => [JSON.stringify(each.ref), each]),
  ),
  widgetOrder: (index.snapshot?.widgets ?? []).map((each) => JSON.stringify(each.ref)),
  calculationOrder: index.snapshot?.calculationOrder ?? [],
});
const withoutOrder = ({ widgetOrder: _order, ...content }: ReturnType<typeof contentOf>) => content;

describe('design ops', () => {
  const widgetRef = (objectNumber: number) =>
    ({ kind: 'objectNumber', page: PAGE, objectNumber }) as const;

  test('a create shows the field and its widgets under the numbers it took', () => {
    const next = predictFormOp(form(), {
      type: 'forms.create',
      draft: {
        family: 'text',
        name: 'total',
        widgets: [{ page: PAGE, rect: { x: 0, y: 40, width: 80, height: 20 } }],
        actions: { calculate: { type: 'javascript', script: 'event.value = 1;' } },
      },
      objectNumber: 90,
      widgetObjectNumbers: [91],
    });
    expect(field(next, 90)).toMatchObject({ name: 'total', family: 'text', value: '' });
    expect(widgetRowOf(next, 91)?.rect).toMatchObject({ x: 0, y: 40, width: 80, height: 20 });
    expect(next.snapshot?.calculationOrder).toEqual([{ kind: 'objectNumber', objectNumber: 90 }]);
    // Without its numbers, it shows once the engine answers.
    const unnamed = form();
    expect(
      predictFormOp(unnamed, { type: 'forms.create', draft: { family: 'text', name: 'later' } }),
    ).toBe(unnamed);
  });

  test('a widget moves, and its field keeps its value', () => {
    const next = predictFormOp(form(), {
      type: 'forms.updateWidget',
      widget: widgetRef(5),
      patch: { rect: { x: 100, y: 100, width: 10, height: 10 } } as never,
    });
    expect(widgetRowOf(next, 5)?.rect).toMatchObject({ x: 100, y: 100 });
    expect(field(next, 4).value).toBe('abc');
  });

  test('deleting one of two widgets leaves the field with the other; deleting the field takes both', () => {
    const one = predictFormOp(form(), { type: 'forms.deleteWidget', widget: widgetRef(11) });
    expect(widgetRowOf(one, 11)).toBeNull();
    expect(field(one, 10).widgets.map((widget) => widget.objectNumber)).toEqual([12]);
    const all = predictFormOp(form(), { type: 'forms.delete', field: agree.ref });
    expect(field(all, 10)).toBeNull();
    expect(widgetRowOf(all, 11)).toBeNull();
    expect(widgetRowOf(all, 12)).toBeNull();
  });

  test('a setting and the widget order change as the engine changes them', () => {
    const renamed = predictFormOp(form(), {
      type: 'forms.update',
      field: name.ref,
      patch: { name: 'full_name', required: true },
    });
    expect(field(renamed, 4)).toMatchObject({ name: 'full_name', required: true });
    const raised = predictFormOp(form(), {
      type: 'forms.reorderWidgets',
      page: PAGE,
      widgets: [widgetRef(5)],
      position: 'end',
    });
    expect(raised.snapshot?.widgets.map((each) => widgetRowOf(raised, 5) === each).at(-1)).toBe(
      true,
    );
  });

  test.each([
    [
      'create',
      {
        type: 'forms.create',
        draft: {
          family: 'checkbox',
          name: 'new',
          widgets: [{ page: PAGE, rect: { x: 0, y: 0, width: 10, height: 10 } }],
        },
        objectNumber: 90,
        widgetObjectNumbers: [91],
      },
    ],
    [
      'update',
      { type: 'forms.update', field: name.ref, patch: { name: 'full_name', maxLength: null } },
    ],
    ['delete', { type: 'forms.delete', field: agree.ref }],
    [
      'updateWidget',
      {
        type: 'forms.updateWidget',
        widget: widgetRef(21),
        patch: { rect: { x: 50, y: 50, width: 10, height: 10 } },
      },
    ],
    ['deleteWidget', { type: 'forms.deleteWidget', widget: widgetRef(12) }],
    [
      'reorderWidgets',
      {
        type: 'forms.reorderWidgets',
        page: PAGE,
        widgets: [widgetRef(5), widgetRef(31)],
        position: 'end',
      },
    ],
  ] as [string, PredictedOp][])('undoing %s shows the form as it was', (_name, op) => {
    const before = form();
    const after = predictFormOp(before, op);
    expect(contentOf(after)).not.toEqual(contentOf(before));
    const undone = undoLookOf(before, [op]).reduce(predictFormOp, after);
    expect(withoutOrder(contentOf(undone))).toEqual(withoutOrder(contentOf(before)));
    if (op.type === 'forms.reorderWidgets') {
      expect(contentOf(undone).widgetOrder).toEqual(contentOf(before).widgetOrder);
    }
  });
});
