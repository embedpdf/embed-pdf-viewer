import type { ConformanceTestRunner } from './runMetadataConformance';
import type { WidgetAnnotation, WidgetPatch } from '../annotation/kinds/widget';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import type { FormFieldDraft } from '../forms/draft';
import type { FormFieldDisplay } from '../forms/effects';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldPatch } from '../forms/patch';
import {
  fieldAfterReset,
  fieldAfterValue,
  formFieldAfter,
  formFieldOfDraft,
  widgetsAfterDisplay,
  type FieldWithWidgets,
} from '../forms/predict';
import type { FormFieldValue } from '../forms/value';
import { widgetAfterPatch } from '../forms/widgets';
import type { PageBox } from '../geometry/pageSpace';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { PageRef } from '../identity/PageRef';
import { toPageRef } from '../identity/PageRef';

export interface FormPredictionConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open `PREDICTION_FIXTURE_PDF` (one blank page). Called once; every case adds its own field. */
  open: (engine: Engine) => Promise<DocumentHandle>;
}

/** The op a case predicts, then runs. */
type FormOp =
  | { readonly type: 'setValue'; readonly value: FormFieldValue }
  | { readonly type: 'reset' }
  | { readonly type: 'display'; readonly display: FormFieldDisplay }
  | { readonly type: 'update'; readonly patch: FormFieldPatch }
  | { readonly type: 'updateWidget'; readonly patch: WidgetPatch };

/** A field, a state it is put in first, and the op predicted from there. */
interface PredictionCase {
  readonly name: string;
  readonly draft: (page: PageRef, name: string) => FormFieldDraft;
  /** Writes that put the field in the state the case starts from. */
  readonly before?: readonly FormOp[];
  readonly op: FormOp;
}

const box = (x: number, y = 600, width = 120, height = 24): PageBox => ({ x, y, width, height });

const text =
  (extra: Partial<Extract<FormFieldDraft, { family: 'text' }>> = {}) =>
  (page: PageRef, name: string): FormFieldDraft => ({
    family: 'text',
    name,
    widgets: [{ page, rect: box(72) }],
    ...extra,
  });

const checkbox =
  (exportValues: readonly (string | undefined)[]) =>
  (page: PageRef, name: string): FormFieldDraft => ({
    family: 'checkbox',
    name,
    widgets: exportValues.map((exportValue, at) => ({
      page,
      rect: box(72 + at * 40, 600, 18, 18),
      ...(exportValue !== undefined ? { exportValue } : {}),
    })),
  });

const radio =
  (
    exportValues: readonly string[],
    extra: { radiosInUnison?: boolean; noToggleToOff?: boolean } = {},
  ) =>
  (page: PageRef, name: string): FormFieldDraft => ({
    family: 'radio',
    name,
    ...extra,
    widgets: exportValues.map((exportValue, at) => ({
      page,
      rect: box(72 + at * 40, 600, 18, 18),
      exportValue,
    })),
  });

const OPTIONS = [
  { label: 'Apple', value: 'a' },
  { label: 'Banana', value: 'b' },
  { label: 'Cherry', value: 'c' },
];

const combo =
  (extra: Partial<Extract<FormFieldDraft, { family: 'combobox' }>> = {}) =>
  (page: PageRef, name: string): FormFieldDraft => ({
    family: 'combobox',
    name,
    options: OPTIONS,
    widgets: [{ page, rect: box(72) }],
    ...extra,
  });

const list =
  (extra: Partial<Extract<FormFieldDraft, { family: 'listbox' }>> = {}) =>
  (page: PageRef, name: string): FormFieldDraft => ({
    family: 'listbox',
    name,
    options: OPTIONS,
    widgets: [{ page, rect: box(72, 560, 120, 60) }],
    ...extra,
  });

const CREATES: readonly { name: string; draft: (page: PageRef, name: string) => FormFieldDraft }[] =
  [
    { name: 'text, as little as it takes', draft: text() },
    {
      name: 'text, every setting',
      draft: text({
        defaultValue: 'Hi',
        maxLength: 8,
        multiline: true,
        comb: false,
        password: false,
        readOnly: true,
        required: true,
        noExport: true,
        alternateName: 'Your name',
        mappingName: 'name',
        groupId: 'buyer',
      }),
    },
    { name: 'text in a comb', draft: text({ maxLength: 6, comb: true }) },
    {
      name: 'text, turned a quarter',
      draft: (page, name) => ({
        family: 'text',
        name,
        widgets: [{ page, box: box(72, 500, 120, 24), rotation: 90 }],
      }),
    },
    {
      name: 'text, styled',
      draft: (page, name) => ({
        family: 'text',
        name,
        widgets: [
          {
            page,
            rect: box(72),
            color: '#ff0000',
            interiorColor: '#eeeeee',
            strokeWidth: 2,
          },
        ],
      }),
    },
    { name: 'checkbox', draft: checkbox([undefined]) },
    {
      name: 'checkbox with a diamond, dashed',
      draft: (page, name) => ({
        family: 'checkbox',
        name,
        widgets: [
          {
            page,
            rect: box(72, 600, 18, 18),
            checkStyle: 'diamond',
            borderStyle: 'dashed',
            dashArray: [1, 1],
          },
        ],
      }),
    },
    { name: 'checkbox, two widgets with their own export value', draft: checkbox(['On', 'On']) },
    {
      name: 'radio group',
      draft: radio(['x', 'y'], { radiosInUnison: true, noToggleToOff: true }),
    },
    { name: 'combo box with a default', draft: combo({ defaultValue: 'b', edit: true }) },
    {
      name: 'list box with a default out of order',
      draft: list({ multiSelect: true, defaultValue: ['c', 'a'] }),
    },
    {
      name: 'signature field',
      draft: (page, name) => ({
        family: 'signature',
        name,
        widgets: [{ page, rect: box(72, 500, 160, 48) }],
      }),
    },
    {
      name: 'push button with a caption',
      draft: (page, name) => ({
        family: 'pushbutton',
        name,
        widgets: [{ page, rect: box(72), caption: 'Go' }],
      }),
    },
  ];

const value = (written: FormFieldValue): FormOp => ({ type: 'setValue', value: written });

const CASES: readonly PredictionCase[] = [
  // ── values ──
  { name: 'text: a value', draft: text(), op: value({ value: 'Hello' }) },
  {
    name: 'text: cut to its length',
    draft: text({ maxLength: 5 }),
    op: value({ value: 'Hello there' }),
  },
  {
    name: 'text: the same value again',
    draft: text(),
    before: [value({ value: 'Same' })],
    op: value({ value: 'Same' }),
  },
  {
    name: 'text: emptied',
    draft: text(),
    before: [value({ value: 'Gone' })],
    op: value({ value: null }),
  },
  { name: 'checkbox: checked', draft: checkbox([undefined]), op: value({ checked: true }) },
  {
    name: 'checkbox: unchecked',
    draft: checkbox([undefined]),
    before: [value({ checked: true })],
    op: value({ checked: false }),
  },
  {
    name: 'checkbox: two widgets check together',
    draft: checkbox(['On', 'On']),
    op: value({ checked: true }),
  },
  { name: 'checkbox: by its export value', draft: checkbox(['On']), op: value({ value: 'On' }) },
  { name: 'radio: a choice', draft: radio(['x', 'y']), op: value({ value: 'y' }) },
  {
    name: 'radio: another choice',
    draft: radio(['x', 'y']),
    before: [value({ value: 'x' })],
    op: value({ value: 'y' }),
  },
  {
    name: 'radio: cleared',
    draft: radio(['x', 'y']),
    before: [value({ value: 'x' })],
    op: value({ value: null }),
  },
  {
    name: 'radio: the same value twice, one checks',
    draft: radio(['x', 'x']),
    op: value({ value: 'x' }),
  },
  {
    name: 'radio: in unison, both check',
    draft: radio(['x', 'x'], { radiosInUnison: true }),
    op: value({ value: 'x' }),
  },
  { name: 'combo box: an option', draft: combo(), op: value({ value: 'b' }) },
  { name: 'combo box: free text', draft: combo({ edit: true }), op: value({ value: 'Durian' }) },
  {
    name: 'combo box: cleared',
    draft: combo(),
    before: [value({ value: 'b' })],
    op: value({ value: null }),
  },
  {
    name: 'list box: several, in option order',
    draft: list({ multiSelect: true }),
    op: value({ selectedValues: ['c', 'a'] }),
  },
  { name: 'list box: one', draft: list(), op: value({ selectedValues: ['b'] }) },
  {
    name: 'list box: cleared',
    draft: list(),
    before: [value({ selectedValues: ['b'] })],
    op: value({ selectedValues: [] }),
  },
  // ── reset ──
  {
    name: 'reset: text to its default',
    draft: text({ defaultValue: 'Start' }),
    before: [value({ value: 'Changed' })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: text without a default',
    draft: text(),
    before: [value({ value: 'Changed' })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: checkbox',
    draft: checkbox([undefined]),
    before: [value({ checked: true })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: radio',
    draft: radio(['x', 'y']),
    before: [value({ value: 'y' })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: combo box to its default',
    draft: combo({ defaultValue: 'c' }),
    before: [value({ value: 'a' })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: list box to its default',
    draft: list({ multiSelect: true, defaultValue: ['a', 'c'] }),
    before: [value({ selectedValues: ['b'] })],
    op: { type: 'reset' },
  },
  {
    name: 'reset: list box without a default',
    draft: list(),
    before: [value({ selectedValues: ['b'] })],
    op: { type: 'reset' },
  },
  // ── display ──
  { name: 'display: hidden', draft: text(), op: { type: 'display', display: 'hidden' } },
  { name: 'display: not printed', draft: text(), op: { type: 'display', display: 'noPrint' } },
  {
    name: 'display: printed, not shown',
    draft: text(),
    op: { type: 'display', display: 'noView' },
  },
  {
    name: 'display: shown again',
    draft: text(),
    before: [{ type: 'display', display: 'hidden' }],
    op: { type: 'display', display: 'visible' },
  },
  // ── settings ──
  { name: 'update: renamed', draft: text(), op: { type: 'update', patch: { name: 'renamed' } } },
  {
    name: 'update: flags',
    draft: text(),
    op: { type: 'update', patch: { required: true, readOnly: true, multiline: true } },
  },
  {
    name: 'update: a length limit',
    draft: text(),
    op: { type: 'update', patch: { maxLength: 4 } },
  },
  {
    name: 'update: the length limit cleared',
    draft: text({ maxLength: 4 }),
    op: { type: 'update', patch: { maxLength: null } },
  },
  {
    name: 'update: a text default',
    draft: text(),
    op: { type: 'update', patch: { defaultValue: 'Default' } },
  },
  {
    name: 'update: the text default cleared',
    draft: text({ defaultValue: 'Default' }),
    op: { type: 'update', patch: { defaultValue: null } },
  },
  {
    name: 'update: tooltip and mapping name',
    draft: text(),
    op: { type: 'update', patch: { alternateName: 'Tip', mappingName: 'map' } },
  },
  {
    name: 'update: tooltip cleared',
    draft: text({ alternateName: 'Tip' }),
    op: { type: 'update', patch: { alternateName: null } },
  },
  {
    name: 'update: another group',
    draft: text({ groupId: 'buyer' }),
    op: { type: 'update', patch: { groupId: 'seller' } },
  },
  {
    name: 'update: radios in unison',
    draft: radio(['x', 'y']),
    op: { type: 'update', patch: { radiosInUnison: true } },
  },
  {
    name: 'update: new options keep the selection',
    draft: combo(),
    before: [value({ value: 'b' })],
    op: {
      type: 'update',
      patch: {
        options: [
          { label: 'B', value: 'b' },
          { label: 'D', value: 'd' },
        ],
      },
    },
  },
  {
    name: 'update: new options drop the selection',
    draft: list({ multiSelect: true, defaultValue: ['a'] }),
    before: [value({ selectedValues: ['a', 'c'] })],
    op: {
      type: 'update',
      patch: {
        options: [
          { label: 'C', value: 'c' },
          { label: 'D', value: 'd' },
        ],
      },
    },
  },
  {
    name: 'update: an editable dropdown keeps its free text',
    draft: combo({ edit: true }),
    before: [value({ value: 'Durian' })],
    op: { type: 'update', patch: { options: [{ label: 'D', value: 'd' }] } },
  },
  {
    name: 'update: a list default',
    draft: list({ multiSelect: true }),
    op: { type: 'update', patch: { defaultValue: ['c', 'b'] } },
  },
  // ── widgets ──
  {
    name: 'widget: an underline border',
    draft: text(),
    op: { type: 'updateWidget', patch: { borderStyle: 'underline' } },
  },
  {
    name: 'widget: dashed, with a pattern',
    draft: text(),
    op: { type: 'updateWidget', patch: { borderStyle: 'dashed', dashArray: [2, 1] } },
  },
  {
    name: 'widget: a checkbox with a cross',
    draft: checkbox([undefined]),
    op: { type: 'updateWidget', patch: { checkStyle: 'cross' } },
  },
  {
    name: "widget: a radio button's square",
    draft: radio(['x', 'y']),
    op: { type: 'updateWidget', patch: { checkStyle: 'square' } },
  },
  {
    name: "widget: back to the family's own symbol",
    draft: checkbox([undefined]),
    before: [{ type: 'updateWidget', patch: { checkStyle: 'star' } }],
    op: { type: 'updateWidget', patch: { checkStyle: null } },
  },
  {
    name: 'widget: moved',
    draft: text(),
    op: { type: 'updateWidget', patch: { box: box(200, 300) } },
  },
  {
    name: 'widget: resized',
    draft: text(),
    op: { type: 'updateWidget', patch: { box: box(72, 600, 200, 40) } },
  },
  {
    name: 'widget: a quarter turn stands it on its side',
    draft: text(),
    op: { type: 'updateWidget', patch: { rotation: 90 } },
  },
  {
    name: 'widget: moved while turned',
    draft: text(),
    before: [{ type: 'updateWidget', patch: { rotation: 270 } }],
    op: { type: 'updateWidget', patch: { box: box(150, 400) } },
  },
];

/** A write the engine refuses: the prediction refuses it too, with the same code. */
const REFUSALS: readonly PredictionCase[] = [
  { name: 'a text field takes no checked', draft: text(), op: value({ checked: true }) },
  { name: 'a value no option has', draft: combo(), op: value({ value: 'zzz' }) },
  {
    name: 'two values for a single list',
    draft: list(),
    op: value({ selectedValues: ['a', 'b'] }),
  },
  {
    name: 'repeated values',
    draft: list({ multiSelect: true }),
    op: value({ selectedValues: ['a', 'a'] }),
  },
  { name: 'an export value no button has', draft: radio(['x', 'y']), op: value({ value: 'z' }) },
  {
    name: 'clearing a radio group that must keep a choice',
    draft: radio(['x', 'y'], { noToggleToOff: true }),
    before: [value({ value: 'x' })],
    op: value({ value: null }),
  },
  {
    name: 'a text widget takes no check style',
    draft: text(),
    op: { type: 'updateWidget', patch: { checkStyle: 'cross' } },
  },
  {
    name: 'a signature field holds no value',
    draft: (page, name) => ({ family: 'signature', name, widgets: [{ page, rect: box(72) }] }),
    op: value({ value: 'x' }),
  },
];

/**
 * What a form op leaves, predicted (`forms/predict.ts`): each op of every
 * family run against a fresh field, and the field and its widgets' rows the
 * engine reads back compared with the prediction, field by field. What the
 * engine stamps on a write (dates, who filled it in), its fonts from the
 * document's default appearance and the names it mints are left out.
 */
export function runFormPredictionConformance(
  runner: ConformanceTestRunner,
  opts: FormPredictionConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`form prediction conformance: ${opts.label}`, () => {
    let engine: Engine;
    let doc: DocumentHandle;
    let page: PageRef;
    let named = 0;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      doc = await opts.open(engine);
      const { pages } = await doc.pages.list();
      page = toPageRef(pages[0]!.ref.objectNumber);
    });

    afterAll(async () => {
      if (doc) await doc.close();
      if (engine) await engine.destroy();
    });

    /** The field `ref` names and its widgets' rows, as a read gives them now. */
    const read = async (ref: FormFieldRef): Promise<FieldWithWidgets> => {
      const snapshot = await doc.forms.list();
      const field = snapshot.fields.find((candidate) => sameRef(candidate.ref, ref));
      if (!field) throw new Error(`no field ${JSON.stringify(ref)}`);
      return { field, widgets: rowsOf(field, snapshot.widgets) };
    };

    const run = async (ref: FormFieldRef, op: FormOp): Promise<void> => {
      switch (op.type) {
        case 'setValue':
          await doc.forms.setValue(ref, op.value);
          return;
        case 'reset':
          await doc.forms.reset([ref]);
          return;
        case 'display':
          await doc.apply({ ops: [{ type: 'forms.setDisplay', field: ref, display: op.display }] });
          return;
        case 'update':
          await doc.forms.update(ref, op.patch);
          return;
        case 'updateWidget': {
          const widget = (await read(ref)).widgets[0]!;
          await doc.forms.updateWidget(widget.ref, op.patch);
          return;
        }
      }
    };

    const predict = (current: FieldWithWidgets, op: FormOp): FieldWithWidgets => {
      switch (op.type) {
        case 'setValue':
          return fieldAfterValue(current, op.value);
        case 'reset':
          return fieldAfterReset(current);
        case 'display':
          return { ...current, widgets: widgetsAfterDisplay(current.widgets, op.display) };
        case 'update':
          return formFieldAfter(current, op.patch);
        case 'updateWidget':
          return {
            ...current,
            widgets: current.widgets.map((row, at) =>
              at === 0 ? widgetAfterPatch(row, op.patch) : row,
            ),
          };
      }
    };

    for (const scenario of CREATES) {
      test(`create: ${scenario.name}`, async () => {
        const draft = scenario.draft(page, `created_${named++}`);
        const { field: created } = await doc.forms.create(draft);
        const actual = await read(created.ref);
        // What the draft can't say: the numbers, names and attribution the engine gives.
        const predicted = formFieldOfDraft(draft, {
          objectNumber: created.ref.kind === 'objectNumber' ? created.ref.objectNumber : 0,
          widgets: actual.widgets.map((row) => row.ref as AnnotationRef),
          widgetNames: actual.widgets.map((row) => row.nm ?? ''),
          groupId: actual.field.groupId,
          createdBy: actual.field.createdBy,
          createdAt: actual.field.createdAt,
        });
        expect(differences(predicted, actual)).toEqual([]);
      });
    }

    for (const scenario of REFUSALS) {
      test(`refused: ${scenario.name}`, async () => {
        const { field: created } = await doc.forms.create(scenario.draft(page, `field_${named++}`));
        for (const op of scenario.before ?? []) await run(created.ref, op);
        const current = await read(created.ref);
        const predicted = codeOf(() => predict(current, scenario.op));
        const actual = await run(created.ref, scenario.op).then(
          () => 'applied',
          (error: unknown) => (error as { code?: string }).code ?? 'unknown',
        );
        expect(predicted).toBe(actual);
        expect(actual === 'applied').toBe(false);
      });
    }

    for (const scenario of CASES) {
      test(scenario.name, async () => {
        const { field: created } = await doc.forms.create(scenario.draft(page, `field_${named++}`));
        for (const op of scenario.before ?? []) await run(created.ref, op);
        const current = await read(created.ref);
        const predicted = predict(current, scenario.op);
        await run(created.ref, scenario.op);
        const actual = await read(created.ref);
        expect(differences(predicted, actual)).toEqual([]);
      });
    }
  });
}

/** The code `run` refuses with, or `'applied'`. */
function codeOf(run: () => unknown): string {
  try {
    run();
    return 'applied';
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

const sameRef = (left: FormFieldRef, right: FormFieldRef): boolean =>
  left.kind === 'objectNumber' && right.kind === 'objectNumber'
    ? left.objectNumber === right.objectNumber
    : left.kind === 'fqn' && right.kind === 'fqn' && left.name === right.name;

/** The rows of a field's widgets, in the field's widget order. */
function rowsOf(field: FormFieldDTO, rows: readonly WidgetAnnotation[]): WidgetAnnotation[] {
  return field.widgets.flatMap((widget) => {
    const row = rows.find(
      (candidate) =>
        candidate.ref.kind === 'objectNumber' && candidate.ref.objectNumber === widget.objectNumber,
    );
    return row ? [row] : [];
  });
}

/**
 * What a prediction leaves as it was: what the engine stamps on every write
 * (dates, who filled a field in), the fonts a widget reads from the
 * document's default appearance, and the name the engine mints.
 */
const UNPREDICTED = new Set([
  'modifiedAt',
  'modifiedBy',
  'filledBy',
  'filledByName',
  'filledAt',
  'fontFamily',
  'fontSize',
  'fontColor',
]);

/** Where the prediction and the read differ, by path; numbers within a thousandth of a point. */
function differences(
  predicted: FieldWithWidgets,
  actual: FieldWithWidgets,
): { path: string; predicted: unknown; actual: unknown }[] {
  const found: { path: string; predicted: unknown; actual: unknown }[] = [];
  const walk = (left: unknown, right: unknown, path: string): void => {
    if (typeof left === 'number' && typeof right === 'number') {
      if (Math.abs(left - right) > 1e-3) found.push({ path, predicted: left, actual: right });
      return;
    }
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (left !== right) found.push({ path, predicted: left, actual: right });
      return;
    }
    if (Array.isArray(left) !== Array.isArray(right)) {
      found.push({ path, predicted: left, actual: right });
      return;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (UNPREDICTED.has(key)) continue;
      walk(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
  };
  walk(predicted, actual, '');
  return found;
}
