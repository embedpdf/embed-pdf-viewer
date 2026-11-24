import { describe, expect, test } from 'vitest';
import {
  formWidget,
  toPageRef,
  type FormField,
  type FormSnapshot,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import { reload } from '@embedpdf/core';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';

import {
  emptyFieldIndex,
  fieldByKey,
  fieldByRef,
  fieldForWidget,
  fieldKeyOf,
  foldFormEvent,
  indexFields,
  indexLoadedFields,
  pageWidgetsOf,
  pictureVersionOf,
  removeWidgets,
  shownWidgetsOf,
  upsertWidgets,
  widgetAt,
  widgetRowOf,
  type FieldIndex,
  type FormWidgetLook,
  type PageWidgets,
} from '../src/model';
import { fillItems, projectWidget } from '../src/read/fill-items';

const text = (over: Partial<Extract<FormField, { kind: 'text' }>> = {}): FormField => ({
  ref: { kind: 'objectNumber', objectNumber: 4 },
  name: 'maxlen_text',
  kind: 'text',
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
  valueEntry: { kind: 'scalar', value: over.value ?? 'abc' },
  defaultValueEntry: { kind: 'scalar', value: '' },
  widgets: [formWidget(4, toPageRef(3))],
  value: 'abc',
  defaultValue: '',
  maxLength: 5,
  multiline: false,
  password: false,
  comb: false,
  format: null,
  ...over,
});

const snapshot = (fields: FormField[]): FormSnapshot =>
  ({
    formKind: 'acroform',
    needsAppearances: false,
    fields,
    widgets: [],
    calculationOrder: [],
  }) as FormSnapshot;

const origin = {
  kind: 'remote',
  sessionId: 'them',
  subject: null,
  at: new Date(0).toISOString(),
  serverSequence: null,
};
const event = (value: object) => ({ origin, widgets: [], ...value }) as unknown as DocumentEvent;
/** A user who may fill in every field. */
const ALWAYS = () => true;
/** A user who may fill in none, or a setting that leaves every field out. */
const NEVER = () => false;
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
/** An unturned widget on its page: its frame is the rect it stands in. */
const placed = (box: { x: number; y: number; width: number; height: number }) => ({
  ref: { kind: 'objectNumber' as const, page: toPageRef(3), objectNumber: 4 },
  box,
  rotation: 0 as const,
  rect: box,
  look: LOOK,
});
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

  test('finds a widget row by its object number, through upserts and removals', () => {
    const row = (objectNumber: number, x: number) =>
      ({
        subtype: 'widget',
        ref: { kind: 'objectNumber', page: toPageRef(3), objectNumber },
        page: toPageRef(3),
        rect: { x, y: 0, width: 10, height: 10 },
      }) as unknown as WidgetAnnotation;
    let index = indexFields({ ...snapshot([text()]), widgets: [row(4, 0), row(7, 20)] });
    expect(widgetRowOf(index, 7)?.rect.x).toBe(20);
    expect(widgetRowOf(index, 9)).toBeNull();

    index = upsertWidgets(index, [row(7, 40), row(9, 60)]);
    expect(widgetRowOf(index, 7)?.rect.x).toBe(40);
    expect(widgetRowOf(index, 9)?.rect.x).toBe(60);

    index = removeWidgets(index, [formWidget(4, toPageRef(3))]);
    expect(widgetRowOf(index, 4)).toBeNull();
    expect(widgetRowOf(index, 9)?.rect.x).toBe(60);
  });

  test("a page's widgets leave out the hidden ones and the ones of no size, and say the state each shows", () => {
    const row = (objectNumber: number, flags: object, appearanceState: string | null = null) =>
      ({
        subtype: 'widget',
        ref: { kind: 'objectNumber', page: toPageRef(3), objectNumber },
        page: toPageRef(3),
        rect: { x: 0, y: 0, width: 10, height: 10 },
        hidden: false,
        noView: false,
        appearanceState,
        ...flags,
      }) as unknown as WidgetAnnotation;
    const index = indexFields({
      ...snapshot([text()]),
      widgets: [
        row(4, {}, 'Off'),
        row(5, { hidden: true }),
        row(6, { noView: true }),
        row(7, {}),
        // A document timestamp's widget, and a box that is only a line.
        row(8, { rect: { x: 0, y: 792, width: 0, height: 0 } }),
        row(9, { rect: { x: 0, y: 0, width: 40, height: 0 } }),
      ],
    });
    expect(shownWidgetsOf(index, 3).map((widget) => widget.appearanceState)).toEqual(['Off', null]);
    expect(
      shownWidgetsOf(index, 3).map(
        (widget) => (widget.ref as { objectNumber: number }).objectNumber,
      ),
    ).toEqual([4, 7]);
    expect(Object.keys(pageWidgetsOf(index, 3))).toEqual(['4', '7']);
    expect(shownWidgetsOf(index, 99)).toEqual([]);
  });

  test("a widget's place is its frame, its quarter turn and the rect it stands in", () => {
    const FRAME = { x: 20, y: 88, width: 160, height: 24 };
    const STANDS = { x: 88, y: 20, width: 24, height: 160 };
    const row = (objectNumber: number, place: object) =>
      ({
        subtype: 'widget',
        ref: { kind: 'objectNumber', page: toPageRef(3), objectNumber },
        page: toPageRef(3),
        hidden: false,
        noView: false,
        appearanceState: null,
        ...place,
      }) as unknown as WidgetAnnotation;
    const index = indexFields({
      ...snapshot([text()]),
      widgets: [
        // Turned a quarter: its frame's sides are its rect's, swapped.
        row(4, { box: FRAME, rotation: 270, rect: STANDS }),
        // Upright, as the engine reads it: no turn, frame and rect the same.
        row(7, { box: FRAME, rotation: null, rect: FRAME }),
      ],
    });
    const widgets = pageWidgetsOf(index, 3);
    expect(widgets[4]).toMatchObject({ box: FRAME, rotation: 270, rect: STANDS });
    expect(widgets[7]).toMatchObject({ box: FRAME, rotation: 0, rect: FRAME });
    expect(
      shownWidgetsOf(index, 3).map(({ box, rotation, rect }) => ({ box, rotation, rect })),
    ).toEqual([
      { box: FRAME, rotation: 270, rect: STANDS },
      { box: FRAME, rotation: 0, rect: FRAME },
    ]);
    // A fill item carries the same place: the control goes in the frame, turned.
    const [item] = fillItems(index, 3, widgets, ALWAYS, ALWAYS);
    expect(item).toMatchObject({ box: FRAME, rotation: 270, rect: STANDS });
    // A point is on a widget where it stands, not where its frame lies before the turn.
    expect(widgetAt(index, widgets, { x: 100, y: 30 })).toMatchObject({
      annotObjectNumber: 4,
      box: FRAME,
      rotation: 270,
      rect: STANDS,
    });
    expect(widgetAt(index, widgets, { x: 30, y: 100 })).toBeNull();
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
      widgets: [formWidget(8, toPageRef(3))],
    });
    index = foldFormEvent(index, event({ type: 'forms.created', field: other })) as FieldIndex;
    expect(fieldForWidget(index, 8)?.name).toBe('other');

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

  test('moves a widget’s picture version when the engine draws it again, and only then', () => {
    const page = toPageRef(3);
    const row = (objectNumber: number) =>
      ({
        subtype: 'widget',
        ref: { kind: 'objectNumber', page, objectNumber },
        page,
        rect: { x: 0, y: 0, width: 10, height: 10 },
      }) as unknown as WidgetAnnotation;
    let index: FieldIndex = indexFields({ ...snapshot([text()]), widgets: [row(4), row(7)] });
    const valueSet = (meta: object) =>
      foldFormEvent(index, event({ type: 'forms.valueSet', field: text(), meta })) as FieldIndex;
    // A checkbox that only switched state: nothing drawn, nothing to fetch.
    index = valueSet({ changedWidgets: [{ page, objectNumber: 4 }], redrawnWidgets: [] });
    expect([pictureVersionOf(index, 4), pictureVersionOf(index, 7)]).toEqual([0, 0]);
    // A text value: the engine drew its widget again.
    index = valueSet({
      changedWidgets: [{ page, objectNumber: 4 }],
      redrawnWidgets: [{ page, objectNumber: 4 }],
    });
    expect([pictureVersionOf(index, 4), pictureVersionOf(index, 7)]).toEqual([1, 0]);
    // A fact that doesn't say what it drew drew what it changed; one naming only a page, all of it.
    index = valueSet({ changedWidgets: [{ page, objectNumber: 7 }] });
    index = valueSet({ changedWidgets: [{ page }] });
    expect([pictureVersionOf(index, 4), pictureVersionOf(index, 7)]).toEqual([2, 2]);
    // A signing draws the signed widget.
    index = foldFormEvent(
      index,
      event({ type: 'signatures.completed', signature: { widget: { page, objectNumber: 7 } } }),
    ) as FieldIndex;
    expect(pictureVersionOf(index, 7)).toBe(3);
    // A widget that went keeps its version, and a load moves every one past the one it had.
    index = removeWidgets(index, [formWidget(4, page)]);
    expect(pictureVersionOf(index, 4)).toBe(2);
    index = indexLoadedFields(index, { ...snapshot([text()]), widgets: [row(7), row(9)] });
    expect([4, 7, 9].map((number) => pictureVersionOf(index, number))).toEqual([3, 4, 0]);
  });

  test('takes the calculation order from a write that changed it, and from a reorder', () => {
    const total = { kind: 'objectNumber', objectNumber: 4 } as const;
    const other = { kind: 'objectNumber', objectNumber: 7 } as const;
    let index: FieldIndex = indexFields(snapshot([text()]));
    // A write that left the order alone carries none, and keeps the mirror's.
    index = foldFormEvent(index, event({ type: 'forms.updated', field: text() })) as FieldIndex;
    expect(index.snapshot?.calculationOrder).toEqual([]);

    index = foldFormEvent(
      index,
      event({ type: 'forms.updated', field: text(), calculationOrder: [total] }),
    ) as FieldIndex;
    expect(index.snapshot?.calculationOrder).toEqual([total]);
    index = foldFormEvent(
      index,
      event({ type: 'forms.calculationsReordered', calculationOrder: [other, total], meta: {} }),
    ) as FieldIndex;
    expect(index.snapshot?.calculationOrder).toEqual([other, total]);
    index = foldFormEvent(
      index,
      event({
        type: 'forms.deleted',
        deleted: other,
        calculationOrder: [total],
        meta: { changedFields: [other], changedWidgets: [] },
      }),
    ) as FieldIndex;
    expect(index.snapshot?.calculationOrder).toEqual([total]);
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
});

describe('fill projection', () => {
  test('joins the field plane with widget geometry', () => {
    const index = indexFields(snapshot([text()]));
    expect(fillItems(index, 3, undefined, ALWAYS, ALWAYS)).toEqual([]);
    const items = fillItems(index, 3, BOXES, ALWAYS, ALWAYS);
    expect(items.length).toBe(1);
    const item = items[0]!;
    expect(item.control).toBe('text');
    expect(item.box).toEqual({ x: 10, y: 20, width: 200, height: 24 });
    expect(item.look).toBe(LOOK);
    if (item.control === 'text') {
      expect(item.value).toBe('abc');
      expect(item.maxLength).toBe(5);
    }
    expect(fillItems(index, 99, BOXES, ALWAYS, ALWAYS)).toEqual([]);
  });

  test('read-only fields, and fields the user may not fill in, project as disabled', () => {
    const readOnly = text({ readOnly: true });
    expect(
      fillItems(indexFields(snapshot([readOnly])), 3, BOXES, ALWAYS, ALWAYS)[0]!.disabled,
    ).toBe(true);
    expect(fillItems(indexFields(snapshot([text()])), 3, BOXES, NEVER, NEVER)[0]!.disabled).toBe(
      true,
    );
    expect(fillItems(indexFields(snapshot([text()])), 3, BOXES, ALWAYS, ALWAYS)[0]!.disabled).toBe(
      false,
    );
  });

  test('whether a field is filled in by hand and whether the user may fill it in are two answers', () => {
    const index = indexFields(snapshot([text()]));
    // Left out by the `fillable` setting, with the permission to fill it in.
    expect(fillItems(index, 3, BOXES, NEVER, ALWAYS)[0]).toMatchObject({
      disabled: true,
      canFill: true,
    });
    // Without the permission, it is neither.
    expect(fillItems(index, 3, BOXES, NEVER, NEVER)[0]).toMatchObject({
      disabled: true,
      canFill: false,
    });
    expect(projectWidget(text(), 4, BOXES[4]!, false, true)).toMatchObject({
      disabled: true,
      canFill: true,
    });
  });
});

const signature = (over: Partial<Extract<FormField, { kind: 'signature' }>> = {}): FormField => ({
  ref: { kind: 'objectNumber', objectNumber: 9 },
  name: 'sig',
  kind: 'signature',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: 'Sign here',
  mappingName: null,
  groupId: null,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  widgets: [formWidget(9, toPageRef(3))],
  ...over,
});

describe('signature widgets', () => {
  test('an unsigned signature field projects a "signature" fill item', () => {
    const item = projectWidget(signature(), 9, BOXES[4]!, true, true);
    expect(item).toMatchObject({ control: 'signature', signed: false, label: 'Sign here' });
  });

  test('a /V on the field marks the item signed', () => {
    const signed = signature({ valueEntry: { kind: 'unsupported' } });
    expect(projectWidget(signed, 9, BOXES[4]!, true, true)).toMatchObject({
      control: 'signature',
      signed: true,
    });
  });

  test('widgetAt resolves the smallest containing widget from loaded geometry', () => {
    const index = indexFields(
      snapshot([text(), signature({ widgets: [formWidget(9, toPageRef(3))] })]),
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

const radio = (over: Partial<Extract<FormField, { kind: 'radio' }>> = {}): FormField => ({
  ref: { kind: 'objectNumber', objectNumber: 20 },
  name: 'plan',
  kind: 'radio',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: 'Plan',
  mappingName: null,
  groupId: null,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
  valueEntry: { kind: 'scalar', value: 'yearly' },
  defaultValueEntry: { kind: 'none' },
  value: 'yearly',
  radiosInUnison: false,
  noToggleToOff: false,
  widgets: [
    { ...formWidget(21, toPageRef(3)), onState: 'monthly', exportValue: 'monthly', checked: false },
    { ...formWidget(22, toPageRef(3)), onState: '1', exportValue: 'Pay yearly', checked: true },
  ],
  ...over,
});

describe('radio buttons', () => {
  const box = BOXES[4]!;

  test("each button is named by its group's tooltip and its own option, and says where it comes", () => {
    expect(projectWidget(radio(), 21, box, true, true, { position: 1, size: 2 })).toMatchObject({
      control: 'toggle',
      kind: 'radio',
      label: 'Plan: monthly',
      checked: false,
      exportValue: 'monthly',
      inGroup: { position: 1, size: 2 },
    });
    // The option is the button's export value: its /Opt entry over its on-state name.
    expect(projectWidget(radio(), 22, box, true, true, { position: 2, size: 2 })).toMatchObject({
      label: 'Plan: Pay yearly',
      checked: true,
      inGroup: { position: 2, size: 2 },
    });
  });

  test("a group without a tooltip goes by the field's name; a checkbox keeps the field's label", () => {
    expect(projectWidget(radio({ alternateName: null }), 21, box, true, true)).toMatchObject({
      label: 'plan: monthly',
      inGroup: null,
    });
    const checkbox = {
      ...radio(),
      kind: 'checkbox',
      checked: true,
      exportValue: 'Yes',
      widgets: [
        { ...formWidget(21, toPageRef(3)), onState: 'Yes', exportValue: 'Yes', checked: true },
      ],
    } as unknown as FormField;
    expect(projectWidget(checkbox, 21, box, true, true)).toMatchObject({
      kind: 'checkbox',
      label: 'Plan',
    });
  });
});
