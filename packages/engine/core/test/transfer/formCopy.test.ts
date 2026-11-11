import { describe, expect, test } from 'vitest';
import type { WidgetAnnotation } from '../../src/annotation/kinds/widget';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { FormField } from '../../src/forms/field';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import type { FormFieldRef } from '../../src/identity/FormFieldRef';
import { toPageRef } from '../../src/identity/PageRef';
import { copyNameOf, fieldNameTaken, planFormCopies } from '../../src/transfer/formCopy';
import { planFormCopy } from '../../src/transfer/planFormCopy';

const page = toPageRef(3);
const other = toPageRef(7);
const widgetRef = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  objectNumber,
});
const fieldRef = (objectNumber: number): FormFieldRef => ({ kind: 'objectNumber', objectNumber });

/** A widget row as the form's `widgets` hold it. */
function row(objectNumber: number, extra: Record<string, unknown> = {}): WidgetAnnotation {
  return {
    subtype: 'widget',
    ref: widgetRef(objectNumber),
    page,
    rect: { x: 40, y: 100, width: 120, height: 20 },
    rotation: 0,
    color: '#111111',
    interiorColor: null,
    strokeWidth: 1,
    borderStyle: 'solid',
    textAlign: 'left',
    fontFamily: 'Helvetica',
    fontSize: 12,
    fontColor: '#000000',
    caption: null,
    actions: null,
    invisible: false,
    hidden: false,
    print: true,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
    ...extra,
  } as unknown as WidgetAnnotation;
}

/** A text field as a read returns it, with one widget for each number given. */
function text(
  objectNumber: number,
  name: string,
  widgets: readonly number[],
  extra: Record<string, unknown> = {},
): FormField {
  return {
    ref: fieldRef(objectNumber),
    name,
    kind: 'text',
    origin: 'acroform',
    readOnly: false,
    required: false,
    noExport: false,
    alternateName: null,
    mappingName: null,
    valueEntry: { kind: 'scalar', value: 'Ada' },
    defaultValueEntry: { kind: 'none' },
    groupId: null,
    value: 'Ada',
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
    widgets: widgets.map((number) => ({ ref: widgetRef(number), objectNumber: number, page })),
    ...extra,
  } as unknown as FormField;
}

const formOf = (fields: FormField[], widgets: WidgetAnnotation[]) => ({
  fields,
  widgets,
  calculationOrder: [] as Array<FormFieldRef | null>,
});

const plan = (
  form: ReturnType<typeof formOf>,
  fields: readonly FormFieldRef[],
  extra: Partial<Parameters<typeof planFormCopies>[0]> = {},
) => planFormCopies({ form, fields, placement: {}, values: true, mayScript: true, ...extra });

describe('copyNameOf', () => {
  const taken = (...names: string[]) => {
    const set = new Set(names);
    return (name: string) => fieldNameTaken(set, name);
  };

  test('the last part gets the next free number', () => {
    expect(copyNameOf('email', taken('email'))).toBe('email_2');
    expect(copyNameOf('text_1', taken('text_1'))).toBe('text_2');
    expect(copyNameOf('text_1', taken('text_1', 'text_2', 'text_3'))).toBe('text_4');
    expect(copyNameOf('email', taken('email', 'email_2'))).toBe('email_3');
  });

  test('a copy stays in its group', () => {
    expect(copyNameOf('billing.name', taken('billing.name'))).toBe('billing.name_2');
    expect(copyNameOf('a.b.row_9', taken('a.b.row_9'))).toBe('a.b.row_10');
  });

  test('a name a group has, or that sits under a field, is taken', () => {
    // `email_2` is a group here: `email_2.home` sits under it.
    expect(copyNameOf('email', taken('email', 'email_2.home'))).toBe('email_3');
  });
});

describe('planFormCopies', () => {
  test('a copy is its source under a new name, with its widgets, moved', () => {
    const form = formOf([text(10, 'email', [11, 12])], [row(11), row(12, { locked: true })]);
    const { creates, dropped } = plan(form, [fieldRef(10)], {
      placement: { offset: { x: 10, y: 20 } },
    });
    expect(dropped).toEqual([]);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      source: 0,
      widgets: [widgetRef(11), widgetRef(12)],
      value: { value: 'Ada' },
      draft: {
        kind: 'text',
        name: 'email_2',
        widgets: [
          { page, rect: { x: 50, y: 120, width: 120, height: 20 }, color: '#111111' },
          { page, rect: { x: 50, y: 120, width: 120, height: 20 } },
        ],
      },
    });
    expect(creates[0]!.flags.map((flags) => flags.locked)).toEqual([false, true]);
  });

  test('page puts every widget on that page, at the same spot', () => {
    const form = formOf([text(10, 'email', [11])], [row(11)]);
    const { creates } = plan(form, [fieldRef(10)], { placement: { page: other } });
    expect(creates[0]!.draft.widgets).toMatchObject([
      { page: other, rect: { x: 40, y: 100, width: 120, height: 20 } },
    ]);
  });

  test('values: false writes no value, and a signature never has one', () => {
    const signed = {
      ...text(20, 'sign', [21]),
      kind: 'signature',
    } as unknown as FormField;
    const form = formOf([text(10, 'email', [11]), signed], [row(11), row(21)]);
    expect(plan(form, [fieldRef(10)], { values: false }).creates[0]).not.toHaveProperty('value');
    expect(plan(form, [fieldRef(20)]).creates[0]).not.toHaveProperty('value');
  });

  test('names claimed by earlier copies are taken', () => {
    const form = formOf([text(10, 'email', [11]), text(20, 'email_2', [21])], [row(11), row(21)]);
    const { creates } = plan(form, [fieldRef(10), fieldRef(10), { kind: 'fqn', name: 'email_2' }]);
    expect(creates.map((create) => create.draft.name)).toEqual(['email_3', 'email_4', 'email_5']);
    expect(creates.map((create) => create.source)).toEqual([0, 1, 2]);
  });

  test('widgets names the widgets to copy', () => {
    const form = formOf(
      [text(10, 'email', [11, 12]), text(20, 'phone', [21])],
      [row(11), row(12), row(21)],
    );
    const { creates } = plan(form, [fieldRef(10)], { widgets: [widgetRef(12)] });
    expect(creates[0]!.widgets).toEqual([widgetRef(12)]);
    // A widget of a field that isn't copied, and a field none of whose widgets is named.
    expect(() => plan(form, [fieldRef(10)], { widgets: [widgetRef(21)] })).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
    expect(() => plan(form, [fieldRef(10), fieldRef(20)], { widgets: [widgetRef(11)] })).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
  });

  test('leaves out a kind the engine doesn’t model, and a script without the right', () => {
    const unknown = { ...text(20, 'odd', [21]), kind: 'unknown' } as unknown as FormField;
    const script = { root: { type: 'javascript', script: 'event.value = 1;', next: [] } };
    const scripted = text(10, 'total', [11], { actions: { calculate: script } });
    const form = {
      ...formOf([scripted, unknown], [row(11), row(21)]),
      calculationOrder: [fieldRef(10)],
    };

    const kept = plan(form, [fieldRef(10), fieldRef(20)]);
    expect(kept.dropped).toEqual([{ ref: fieldRef(20), reason: 'unsupported-kind' }]);
    expect(kept.creates.map((create) => create.source)).toEqual([0]);
    expect(kept.creates[0]!.draft.actions?.calculate).toBeDefined();
    expect(kept.calculationOrder).toEqual([0]);

    const without = plan(form, [fieldRef(10)], { mayScript: false });
    expect(without.dropped).toEqual([
      { ref: fieldRef(10), field: 'actions.calculate', reason: 'script-not-allowed' },
    ]);
    expect(without.creates[0]!.draft.actions).toBeUndefined();
    expect(without.calculationOrder).toEqual([]);
  });

  test('refuses a field the form doesn’t have', () => {
    const form = formOf([text(10, 'email', [11])], [row(11)]);
    expect(() => plan(form, [fieldRef(99)])).toThrow(
      expect.objectContaining({ code: EngineErrorCode.NotFound }),
    );
  });

  test('the engine’s plan checks each create against the create schema', () => {
    const form = formOf([text(10, 'email', [11], { maxLength: -1 })], [row(11)]);
    const input = { form, fields: [fieldRef(10)], placement: {}, values: true, mayScript: true };
    expect(planFormCopies(input).creates).toHaveLength(1);
    expect(() => planFormCopy(input)).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
  });
});
