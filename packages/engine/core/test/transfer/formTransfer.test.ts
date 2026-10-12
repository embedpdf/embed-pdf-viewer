import { describe, expect, test } from 'vitest';
import type { WidgetAnnotation } from '../../src/annotation/kinds/widget';
import type { PdfActionNode, PdfActionTree } from '../../src/dto/PdfAction';
import { EngineError } from '../../src/errors/EngineError';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { FormFieldDTO } from '../../src/forms/field';
import type { FormSnapshot } from '../../src/forms/snapshot';
import type { FormFieldRef } from '../../src/identity/FormFieldRef';
import { toPageRef } from '../../src/identity/PageRef';
import { DEFAULT_BUNDLE_LIMITS } from '../../src/transfer/bundleLimits';
import type { FormBundle } from '../../src/transfer/FormBundle';
import { formExportRowsOf } from '../../src/transfer/formExport';
import { planFormImport, planFormValuesImport } from '../../src/transfer/formImport';
import { FormTransfer } from '../../src/transfer/FormTransfer';

const page = toPageRef(3);
const size = { width: 300, height: 300 };
const refOf = (objectNumber: number): FormFieldRef => ({ kind: 'objectNumber', objectNumber });
const widgetRef = (objectNumber: number) => ({ kind: 'objectNumber', page, objectNumber }) as const;

/** A node's own data: every member but its `/Next` and raw `/S`. */
type NodeData = PdfActionNode extends infer Node
  ? Node extends PdfActionNode
    ? Omit<Node, 'next' | 'subtype'>
    : never
  : never;

const tree = (node: NodeData): PdfActionTree =>
  ({
    root: { subtype: '', next: [], ...node },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  }) as PdfActionTree;

/** A text field as a read returns it, with one widget per number in `widgets`. */
function textField(
  name: string,
  objectNumber: number,
  widgets: number[],
  fields: Record<string, unknown> = {},
): FormFieldDTO {
  return {
    ref: refOf(objectNumber),
    name,
    family: 'text',
    origin: 'acroform',
    readOnly: false,
    required: false,
    noExport: false,
    alternateName: null,
    mappingName: null,
    valueEntry: { kind: 'scalar', value: `${name} value` },
    defaultValueEntry: { kind: 'none' },
    createdBy: 'alice',
    createdAt: '2026-10-08T10:42:00Z',
    filledBy: 'alice',
    filledByName: 'Alice',
    filledAt: '2026-10-08T10:43:00Z',
    importedBy: null,
    value: `${name} value`,
    defaultValue: '',
    maxLength: null,
    multiline: false,
    password: false,
    comb: false,
    widgets: widgets.map((number) => ({ ref: widgetRef(number), objectNumber: number, page })),
    ...fields,
  } as unknown as FormFieldDTO;
}

/** A widget row as a read returns it. */
function widgetRow(
  objectNumber: number,
  field: FormFieldRef,
  fields: Record<string, unknown> = {},
) {
  return {
    subtype: 'widget',
    ref: widgetRef(objectNumber),
    page,
    field,
    rect: { x: 20, y: 20, width: 120, height: 24 },
    strokeWidth: 1,
    borderStyle: 'solid',
    textAlign: 'left',
    color: '#000000',
    interiorColor: null,
    fontFamily: 'helvetica',
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
    ...fields,
  } as unknown as WidgetAnnotation;
}

function bundleOf(
  fields: FormFieldDTO[],
  widgets: WidgetAnnotation[],
  calculationOrder: FormFieldRef[] = [],
): FormBundle {
  return {
    format: 'embedpdf/form',
    version: 1,
    pages: [{ page, position: 0, size }],
    fields: fields.map((data) => ({ data })),
    widgets: widgets.map((data) => ({ data, resources: {} })),
    calculationOrder,
    resources: {},
  };
}

const target = [{ page, position: 0 }];

function plan(
  bundle: FormBundle,
  options: { taken?: string[]; mayScript?: boolean; values?: boolean } = {},
) {
  return planFormImport({
    bundle,
    target,
    nameTaken: (name) => (options.taken ?? []).includes(name),
    mayScript: options.mayScript ?? true,
    values: options.values ?? true,
  });
}

describe('planFormImport', () => {
  test('makes a create per field, with its widgets placed and its value', () => {
    const name = textField('customer.name', 10, [11]);
    const { creates, dropped } = plan(bundleOf([name], [widgetRow(11, name.ref)]));
    expect(dropped).toEqual([]);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      field: 0,
      widgets: [0],
      value: { value: 'customer.name value' },
      draft: {
        family: 'text',
        name: 'customer.name',
        widgets: [{ page, rect: { x: 20, y: 20, width: 120, height: 24 }, fontSize: 12 }],
      },
    });
    expect(creates[0]!.flags).toEqual([expect.objectContaining({ print: true, hidden: false })]);
    expect(
      plan(bundleOf([name], [widgetRow(11, name.ref)]), { values: false }).creates[0],
    ).not.toHaveProperty('value');
  });

  test('leaves out a taken name, a name the bundle names twice, an unknown family, a widget without its field', () => {
    const a = textField('a', 10, [11]);
    const again = textField('a', 20, [21]);
    const taken = textField('taken', 30, []);
    const unknown = { ...textField('odd', 40, []), family: 'unknown' } as FormFieldDTO;
    const { creates, dropped } = plan(
      bundleOf(
        [a, again, taken, unknown],
        [widgetRow(11, a.ref), widgetRow(21, again.ref), widgetRow(99, refOf(98))],
      ),
      { taken: ['taken'] },
    );
    expect(creates.map((create) => create.draft.name)).toEqual(['a']);
    expect(dropped).toEqual([
      { ref: again.ref, reason: 'name-conflict' },
      { ref: taken.ref, reason: 'name-conflict' },
      { ref: unknown.ref, reason: 'unsupported-family' },
      { ref: refOf(98), widget: widgetRef(99), reason: 'no-field' },
    ]);
  });

  test("without doc.forms.script, leaves out scripts, submits and links, and keeps the view's own actions", () => {
    const field = textField('total', 10, [11], {
      actions: { calculate: tree({ type: 'javascript', script: 'event.value = 1;' }) },
    });
    const row = widgetRow(11, field.ref, {
      actions: {
        activate: tree({ type: 'uri', uri: 'https://example.com', isMap: false }),
        focus: tree({ type: 'reset-form', fields: null, exclude: false }),
      },
    });
    const bundle = bundleOf([field], [row], [field.ref]);
    const { creates, dropped, calculationOrder } = plan(bundle, { mayScript: false });
    expect(dropped).toEqual([
      { ref: field.ref, field: 'actions.calculate', reason: 'script-not-allowed' },
      { ref: field.ref, widget: row.ref, field: 'actions.activate', reason: 'script-not-allowed' },
    ]);
    expect(creates[0]!.draft.actions).toBeUndefined();
    expect(creates[0]!.draft.widgets![0]!.actions).toEqual({
      focus: { type: 'reset-form', fields: null, exclude: false },
    });
    // Without its calculate script, the copy has no place in the order.
    expect(calculationOrder).toEqual([]);
    expect(plan(bundle).calculationOrder).toEqual([0]);
  });

  test('refuses a field whose data a create would refuse, naming it', () => {
    const bad = textField('bad', 10, [], { maxLength: -1 });
    const refused = (() => {
      try {
        plan(bundleOf([bad], []));
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(EngineError.is(refused, EngineErrorCode.InvalidArg)).toBe(true);
    expect((refused as EngineError).details).toMatchObject({ item: 0, field: 'maxLength' });
  });
});

describe('planFormValuesImport', () => {
  test('fills by full name and leaves out, in bundle order, what it cannot', () => {
    const name = textField('name', 10, []);
    const missing = textField('missing', 20, []);
    const box = textField('box', 30, []);
    const locked = textField('locked', 40, []);
    const empty = textField('empty', 50, [], { valueEntry: { kind: 'none' } });
    const fields = [
      { ref: refOf(110), name: 'name', family: 'text' as const },
      { ref: refOf(130), name: 'box', family: 'checkbox' as const },
      { ref: refOf(140), name: 'locked', family: 'text' as const },
      { ref: refOf(150), name: 'empty', family: 'text' as const },
    ];
    const { writes, dropped } = planFormValuesImport({
      bundle: bundleOf([name, missing, box, locked, empty], []),
      target: fields,
      refusal: (field) => (field.name === 'locked' ? 'locked' : null),
    });
    expect(writes).toEqual([{ field: 0, target: fields[0], value: { value: 'name value' } }]);
    expect(dropped).toEqual([
      { ref: missing.ref, reason: 'no-field' },
      { ref: box.ref, reason: 'wrong-family' },
      { ref: locked.ref, reason: 'locked' },
    ]);
  });
});

describe('formExportRowsOf', () => {
  const snapshotOf = (fields: FormFieldDTO[], widgets: WidgetAnnotation[]): FormSnapshot =>
    ({
      fields,
      widgets,
      calculationOrder: fields.map((field) => field.ref),
    }) as unknown as FormSnapshot;

  test('takes whole fields: a signature unsigned, a field the form does not export without its value', () => {
    const signed = {
      ...textField('sign', 10, []),
      family: 'signature',
      valueEntry: { kind: 'scalar', value: '12 0 R' },
    } as unknown as FormFieldDTO;
    const quiet = textField('quiet', 20, [], { noExport: true });
    const { fields, calculationOrder } = formExportRowsOf(snapshotOf([signed, quiet], []), {}, [
      page,
    ]);
    expect(fields[0]!.valueEntry).toEqual({ kind: 'none' });
    expect(fields[1]).toMatchObject({
      value: '',
      valueEntry: { kind: 'none' },
      filledBy: null,
      filledAt: null,
      createdBy: 'alice',
    });
    expect(calculationOrder).toEqual([signed.ref, quiet.ref]);
  });

  test('refuses a field or a page the document does not have', () => {
    const snapshot = snapshotOf([textField('a', 10, [])], []);
    expect(() =>
      formExportRowsOf(snapshot, { fields: [{ kind: 'fqn', name: 'b' }] }, [page]),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.NotFound }));
    expect(() => formExportRowsOf(snapshot, { pages: [toPageRef(9)] }, [page])).toThrow(
      expect.objectContaining({ code: EngineErrorCode.NotFound }),
    );
  });
});

describe('a form bundle through the file', () => {
  const name = textField('name', 10, [11]);
  const bundle = bundleOf([name], [widgetRow(11, name.ref)], [name.ref]);

  test('comes back as the same bundle', async () => {
    expect(await FormTransfer.parse(FormTransfer.stringify(bundle))).toEqual(bundle);
  });

  test("refuses another family's file, and one past a limit", async () => {
    const annotations = JSON.stringify({
      ...JSON.parse(FormTransfer.stringify(bundle)),
      format: 'embedpdf/annotations',
    });
    await expect(FormTransfer.parse(annotations)).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
    });
    await expect(
      FormTransfer.parse(FormTransfer.stringify(bundle), {
        limits: { ...DEFAULT_BUNDLE_LIMITS, items: 1 },
      }),
    ).rejects.toMatchObject({ code: EngineErrorCode.PayloadTooLarge, details: { limit: 'items' } });
  });
});
