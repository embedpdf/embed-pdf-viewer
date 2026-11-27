import { describe, expect, test } from 'vitest';

import { AnnotationSchema } from '../../src/annotation/kinds';
import { WidgetDTOSchema, withWidgetLayout } from '../../src/annotation/kinds/widget';
import { withButtonImage } from '../../src/forms/buttonImage';
import { FormFieldDTOSchema, WidgetPlacementSchema } from '../../src/forms/schema';
import { fitWidgetToFamily } from '../../src/forms/widgets';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { completeFormBundle } from '../../src/transfer/FormBundle';
import { annotationOfDraft } from '../../src/pageSpace/helpers';
import { BUTTON_IMAGE_AND_LAYOUT_SINCE } from '../../src/wire/apiVersion';
import { changeKindSince } from '../../src/wire/changeKinds';
import { ChangeOpWireSchema } from '../../src/wire/changeSchemas';

const PAGE = { kind: 'objectNumber', objectNumber: 3 } as const;

const BUTTON = {
  ref: { kind: 'objectNumber', objectNumber: 20 },
  name: 'initials',
  kind: 'pushbutton',
  origin: 'acroform',
  readOnly: false,
  required: false,
  noExport: false,
  alternateName: null,
  mappingName: null,
  valueEntry: { kind: 'none' },
  defaultValueEntry: { kind: 'none' },
  groupId: null,
  forAnyone: false,
  purpose: null,
  createdBy: null,
  createdAt: null,
  filledBy: null,
  filledByName: null,
  filledAt: null,
  importedBy: null,
  hasImage: true,
  widgets: [],
} as const;

/** A push button's widget row, as a read gives it: what a create of it reads back, in a field. */
const ROW = {
  ...annotationOfDraft(
    { subtype: 'widget', box: { x: 10, y: 10, width: 90, height: 30 }, layout: 'image' } as never,
    { ref: { kind: 'objectNumber', page: PAGE, objectNumber: 21 } },
  ),
  field: { kind: 'objectNumber', objectNumber: 20 },
  fieldKind: 'pushbutton',
  caption: null,
  layout: 'image',
  hasMark: false,
} as Record<string, unknown>;

describe('a push button holds a picture: reading an older side', () => {
  test('a field without `hasImage` holds none; another kind gets no such fact', () => {
    const { hasImage: _hasImage, ...older } = BUTTON;
    expect(withButtonImage(older)).toEqual({ ...older, hasImage: false });
    expect(withButtonImage(BUTTON)).toBe(BUTTON);
    const text = { kind: 'text', name: 'a' };
    expect(withButtonImage(text)).toBe(text);
  });

  test('the field schema reads an older server whole', () => {
    const { hasImage: _hasImage, ...older } = BUTTON;
    expect(FormFieldDTOSchema.parse(older)).toMatchObject({ kind: 'pushbutton', hasImage: false });
    expect(FormFieldDTOSchema.parse(BUTTON)).toMatchObject({ hasImage: true });
  });

  test("a widget row without `layout` shows a push button's caption, and no other widget has one", () => {
    const { layout: _layout, ...older } = ROW;
    expect(withWidgetLayout(older)).toEqual({ ...older, layout: 'caption' });
    const text = { ...older, fieldKind: 'text' };
    expect(withWidgetLayout(text)).toEqual({ ...text, layout: null });
    expect(withWidgetLayout(ROW)).toBe(ROW);
    // As a form row and as an annotation, the wire reads it the same way.
    expect(WidgetDTOSchema.parse(older)).toMatchObject({ layout: 'caption' });
    expect(AnnotationSchema.parse(older)).toMatchObject({ subtype: 'widget', layout: 'caption' });
    expect(WidgetDTOSchema.parse(ROW)).toMatchObject({ layout: 'image' });
  });

  test('a layout outside the seven is no layout', () => {
    expect(WidgetDTOSchema.safeParse({ ...ROW, layout: 'beside' }).success).toBe(false);
  });

  test('a bundle written before both is completed: its fields and its widget rows', () => {
    const { hasImage: _hasImage, ...field } = BUTTON;
    const { layout: _layout, ...row } = ROW;
    const bundle = { fields: [{ data: field }], widgets: [{ data: row, resources: {} }] };
    const whole = completeFormBundle(bundle);
    expect(whole.fields[0]!.data).toMatchObject({ hasImage: false });
    expect(whole.widgets[0]!.data).toMatchObject({ layout: 'caption' });
    // A bundle that has them comes back as it is.
    const current = { fields: [{ data: BUTTON }], widgets: [{ data: ROW, resources: {} }] };
    expect(completeFormBundle(current)).toBe(current);
  });
});

describe('a layout goes on a push button only', () => {
  test("a push button's placement takes any of the seven", () => {
    for (const layout of ['caption', 'image', 'caption-below', 'caption-over'] as const) {
      expect(fitWidgetToFamily('pushbutton', { layout })).toEqual({ layout });
    }
  });

  test('another widget refuses one, and drops the `null` its row reads', () => {
    for (const kind of ['text', 'checkbox', 'signature', 'unknown'] as const) {
      expect(() => fitWidgetToFamily(kind, { layout: 'image' })).toThrow(
        expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
      );
      expect(fitWidgetToFamily(kind, { layout: null, color: '#000000' })).toEqual({
        color: '#000000',
      });
    }
  });

  test('a push button always has a layout: `null` is refused', () => {
    expect(() => fitWidgetToFamily('pushbutton', { layout: null })).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
  });

  test('a placement names a layout on the wire', () => {
    const placement = {
      page: PAGE,
      rect: { x: 10, y: 10, width: 90, height: 30 },
      layout: 'caption-left',
    };
    expect(WidgetPlacementSchema.parse(placement)).toEqual(placement);
    expect(WidgetPlacementSchema.safeParse({ ...placement, layout: 'beside' }).success).toBe(false);
  });
});

describe('the change op `forms.setButtonImage`', () => {
  test('names its picture by a part, or takes it out with null', () => {
    const op = {
      type: 'forms.setButtonImage',
      field: { kind: 'fqn', name: 'initials' },
      resources: { image: 'r0' },
    };
    expect(ChangeOpWireSchema.parse(op)).toEqual(op);
    const none = { ...op, resources: { image: null } };
    expect(ChangeOpWireSchema.parse(none)).toEqual(none);
    expect(ChangeOpWireSchema.safeParse({ ...op, resources: {} }).success).toBe(false);
  });

  test('arrived with the layout, in its own version', () => {
    expect(BUTTON_IMAGE_AND_LAYOUT_SINCE).toBe('3.5');
    expect(changeKindSince('forms.setButtonImage')).toBe(BUTTON_IMAGE_AND_LAYOUT_SINCE);
  });
});
