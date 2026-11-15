/**
 * Duplicate for form fields, on a real engine with the annotation plugin and the history. A
 * whole field's copy is a new field, named after its original, shown before the engine answers
 * as the engine then writes it. A widget's copy follows from what the widget is: a radio button
 * joins its group, any other widget becomes a new field. In design mode the selection's
 * duplicate copies the form's widgets with the annotations beside them, as one step.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  annotationKey,
  type AnnotationRef,
  type FormFieldRef,
  type PageRef,
  type ToggleFieldWidget,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin, InteractionToken } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';
import { gated, type HeldChange } from './helpers/fill-form';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

/** The fixture's merged text field and widget `name`, on the page the tests build on. */
const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };
const named = (name: string): FormFieldRef => ({ kind: 'fqn', name });

async function boot(scope?: readonly string[]) {
  const held: HeldChange[] = [];
  let holding = false;
  let inner: DocumentHandle | null = null;
  const kernel = createKernel({
    engine: gated(
      engine,
      held,
      (doc) => (inner = doc),
      () => holding,
    ),
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open(
    { kind: 'bytes', id: `duplicate-${Math.random()}`, bytes: CHANGE_FIXTURE_PDF.slice() },
    scope ? ({ scope } as never) : undefined,
  );
  const form = kernel.capability(FormToken);
  const annotation = kernel.capability(AnnotationToken);
  const interaction = kernel.capability(InteractionToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  await annotation.whenSynced();
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');
  const page = form.get(NAME)!.widgets[0]!.page as PageRef;
  /** A field's widgets, as annotation refs, in its order. */
  const widgetsOf = (field: FormFieldRef): AnnotationRef[] =>
    form.get(field)!.widgets.map((widget) => ({
      kind: 'objectNumber',
      page: widget.page!,
      objectNumber: widget.objectNumber,
    }));
  const square = (await doc.annotations.list()).annotations.find(
    (each) => each.subtype === 'square',
  )!;
  /** Undo or redo, and wait for the engine's answer. */
  const step = (direction: 'undo' | 'redo') =>
    new Promise<void>((done, fail) => {
      const offs = [
        history.onUndone(() => {
          offs.forEach((off) => off());
          done();
        }),
        history.onUndoFailed((event) => {
          offs.forEach((off) => off());
          fail(event.error);
        }),
      ];
      history[direction]();
    });
  return {
    kernel,
    form,
    annotation,
    history,
    doc,
    page,
    widgetsOf,
    square,
    step,
    names: () => form.list().map((field) => field.name),
    hold: () => {
      holding = true;
    },
    /** Let every held change go to the engine, in order, and stop holding. */
    release: async () => {
      holding = false;
      while (held.length > 0) {
        const write = held.shift()!;
        await doc.apply(write.change, write.options as never).then(write.resolve, write.reject);
      }
    },
    design: () => interaction.activateTool('form-edit'),
    destroy: () => kernel.destroy(),
  };
}

const box = (x: number, y: number, width = 120, height = 20) => ({ x, y, width, height });
const OFFSET = { x: 10, y: 10 };

/** Let what an async verb stages before its first wait on the engine be staged. */
const staged = async (): Promise<void> => {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
};

/** What a prediction can't know: what the engine names and stamps as it writes. */
const STAMPED = new Set([
  'nm',
  'author',
  'createdBy',
  'createdAt',
  'modifiedAt',
  'modifiedBy',
  'userId',
  'filledBy',
  'filledByName',
  'filledAt',
]);

/**
 * Where `left` and `right` differ, as paths, apart from what the engine
 * stamps. Numbers are the same within a hundredth of a point.
 */
function differences(left: unknown, right: unknown, path = ''): string[] {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) <= 0.01 ? [] : [`${path}: ${left} is not ${right}`];
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return left === right
      ? []
      : [`${path}: ${JSON.stringify(left)} is not ${JSON.stringify(right)}`];
  }
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names]
    .filter((name) => !STAMPED.has(name))
    .flatMap((name) =>
      differences(
        (left as Record<string, unknown>)[name],
        (right as Record<string, unknown>)[name],
        path ? `${path}.${name}` : name,
      ),
    );
}

describe('duplicate', () => {
  it('copies a field whole: shown at once, as the engine then writes it, and one undo step', async () => {
    const booted = await boot();
    try {
      const { form, history, page } = booted;
      await form.create({
        kind: 'text',
        name: 'email',
        required: true,
        maxLength: 40,
        widgets: [{ page, rect: box(72, 300), color: '#1d4ed8' }],
      });
      await form.setValue(named('email'), { value: 'ada@example.com' });
      const before = booted.names();

      booted.hold();
      const pending = form.duplicate([named('email')], { offset: OFFSET });
      // Before the engine answers: the copy, under its new name, moved, with no answer.
      expect(booted.names()).toEqual([...before, 'email_2']);
      const shown = form.get(named('email_2'))!;
      expect(shown).toMatchObject({ kind: 'text', required: true, maxLength: 40, value: '' });
      const shownRows = form.getWidgets(named('email_2'));
      expect(shownRows.map((row) => row.box)).toEqual([box(82, 310)]);
      expect(shownRows[0]!.color).toBe('#1d4ed8');
      await booted.release();

      const result = await pending;
      expect(result.dropped).toEqual([]);
      expect(result.fields.map((field) => field.name)).toEqual(['email_2']);
      // What showed is what the engine wrote.
      expect(differences(shown, result.fields[0])).toEqual([]);
      expect(differences(shownRows, result.widgets)).toEqual([]);
      // The original keeps its answer.
      expect(form.get(named('email'))).toMatchObject({ value: 'ada@example.com' });
      expect(history.getUndoLabel()).toMatchObject({ key: 'form.duplicate' });

      await booted.step('undo');
      expect(booted.names()).toEqual(before);
      await booted.step('redo');
      expect(booted.names()).toEqual([...before, 'email_2']);
    } finally {
      await booted.destroy();
    }
  });

  it('values: true gives the copy its original’s answer', async () => {
    const booted = await boot();
    try {
      const { form, page } = booted;
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(72, 300) }] });
      await form.setValue(named('city'), { value: 'Utrecht' });

      const pending = form.duplicate([named('city')], { values: true });
      expect(form.get(named('city_2'))).toMatchObject({ value: 'Utrecht' });
      expect((await pending).fields[0]).toMatchObject({ name: 'city_2', value: 'Utrecht' });
    } finally {
      await booted.destroy();
    }
  });

  it('a whole radio group’s copy is a new group with the same buttons', async () => {
    const booted = await boot();
    try {
      const { form, page } = booted;
      await form.create({
        kind: 'radio',
        name: 'plan',
        widgets: [
          { page, rect: box(72, 300, 16, 16), exportValue: 'monthly' },
          { page, rect: box(72, 330, 16, 16), exportValue: 'yearly' },
        ],
      });
      const { fields } = await form.duplicate([named('plan')], { offset: { x: 60, y: 0 } });
      expect(fields[0]).toMatchObject({ kind: 'radio', name: 'plan_2' });
      expect(fields[0]!.widgets.map((each) => (each as ToggleFieldWidget).exportValue)).toEqual([
        'monthly',
        'yearly',
      ]);
      expect(form.getWidgets(named('plan_2')).map((row) => row.box)).toEqual([
        box(132, 300, 16, 16),
        box(132, 330, 16, 16),
      ]);
      expect(form.get(named('plan'))!.widgets).toHaveLength(2);
    } finally {
      await booted.destroy();
    }
  });
});

describe('duplicateWidgets', () => {
  it('a radio button’s copy joins its group, and any other widget’s is a new field', async () => {
    const booted = await boot();
    try {
      const { form, history, page } = booted;
      await form.create({
        kind: 'radio',
        name: 'plan',
        widgets: [{ page, rect: box(72, 300, 16, 16), exportValue: 'Choice1', color: '#ff0000' }],
      });
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(72, 360) }] });
      const [button] = booted.widgetsOf(named('plan'));
      const [city] = booted.widgetsOf(named('city'));
      const before = booted.names();

      booted.hold();
      const pending = form.duplicateWidgets([button!, city!], { offset: { x: 0, y: 24 } });
      await staged();
      // At once: the group has a second button, and there is a second text field.
      expect(
        form.get(named('plan'))!.widgets.map((each) => (each as ToggleFieldWidget).exportValue),
      ).toEqual(['Choice1', 'Choice2']);
      expect(form.getWidgets(named('plan')).map((row) => row.box)).toEqual([
        box(72, 300, 16, 16),
        box(72, 324, 16, 16),
      ]);
      expect(booted.names()).toEqual([...before, 'city_2']);
      await booted.release();

      const result = await pending;
      expect(result.dropped).toEqual([]);
      expect(result.fields.map((field) => field.name).sort()).toEqual(['city_2', 'plan']);
      // The copies, in the order their originals were given.
      expect(result.widgets.map((row) => row.box)).toEqual([box(72, 324, 16, 16), box(72, 384)]);
      expect(result.widgets[0]!.color).toBe('#ff0000');
      expect(history.getUndoLabel()).toMatchObject({ key: 'form.duplicate' });

      // The copy of the copy counts on.
      const next = await form.duplicateWidgets([result.widgets[0]!.ref], {
        offset: { x: 0, y: 24 },
      });
      expect(
        next.fields[0]!.widgets.map((each) => (each as ToggleFieldWidget).exportValue),
      ).toEqual(['Choice1', 'Choice2', 'Choice3']);

      // One step each.
      await booted.step('undo');
      await booted.step('undo');
      expect(booted.names()).toEqual(before);
      expect(form.get(named('plan'))!.widgets).toHaveLength(1);
    } finally {
      await booted.destroy();
    }
  });

  it('widgets of one field copied together are one new field, and one alone a field of one', async () => {
    const booted = await boot();
    try {
      const { form, page } = booted;
      await form.create({
        kind: 'text',
        name: 'reference',
        widgets: [
          { page, rect: box(72, 300) },
          { page, rect: box(72, 340) },
        ],
      });
      const [first, second] = booted.widgetsOf(named('reference'));

      const both = await form.duplicateWidgets([first!, second!], { offset: OFFSET });
      expect(both.fields.map((field) => field.name)).toEqual(['reference_2']);
      expect(both.widgets.map((row) => row.box)).toEqual([box(82, 310), box(82, 350)]);

      const one = await form.duplicateWidgets([second!], { offset: { x: 200, y: 0 } });
      expect(one.fields.map((field) => field.name)).toEqual(['reference_3']);
      expect(one.widgets.map((row) => row.box)).toEqual([box(272, 340)]);
      expect(form.get(named('reference'))!.widgets).toHaveLength(2);
    } finally {
      await booted.destroy();
    }
  });

  it('a copied button keeps its flags, and a widget the form doesn’t show is refused', async () => {
    const booted = await boot();
    try {
      const { form, page } = booted;
      await form.create({
        kind: 'radio',
        name: 'plan',
        widgets: [{ page, rect: box(72, 300, 16, 16), exportValue: 'Choice1' }],
      });
      const [button] = booted.widgetsOf(named('plan'));
      await form.updateWidget(button!, { print: false });

      const { widgets } = await form.duplicateWidgets([button!], { offset: OFFSET });
      expect(widgets[0]).toMatchObject({ print: false });

      const missing: AnnotationRef = { kind: 'objectNumber', page, objectNumber: 9999 };
      await expect(form.duplicateWidgets([missing])).rejects.toMatchObject({ code: 'not-found' });
    } finally {
      await booted.destroy();
    }
  });
});

describe('Duplicate in design mode', () => {
  it('copies the selected widgets and annotations as one step, and selects the copies', async () => {
    const booted = await boot();
    try {
      const { form, annotation, history, page, square } = booted;
      await form.create({
        kind: 'radio',
        name: 'plan',
        widgets: [{ page, rect: box(72, 300, 16, 16), exportValue: 'Choice1' }],
      });
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(72, 360) }] });
      booted.design();
      await annotation.whenSynced();
      const [button] = booted.widgetsOf(named('plan'));
      const [city] = booted.widgetsOf(named('city'));
      const originals = [square.ref, button!, city!];
      annotation.selection.select(originals);
      expect(annotation.selection.getSelected()).toHaveLength(3);
      expect(annotation.selection.canDuplicate()).toBe(true);
      history.clear();
      const fields = booted.names();
      const annotations = annotation.list().length;

      booted.hold();
      const pending = annotation.selection.duplicate();
      await staged();
      // At once: the three copies show, and they are the selection.
      const copies = annotation.selection.getSelected();
      expect(copies.map((copy) => copy.subtype)).toEqual(['square', 'widget', 'widget']);
      const keys = new Set(originals.map(annotationKey));
      expect(copies.some((copy) => keys.has(annotationKey(copy.ref)))).toBe(false);
      expect(booted.names()).toEqual([...fields, 'city_2']);
      expect(form.get(named('plan'))!.widgets).toHaveLength(2);
      await booted.release();

      const result = await pending;
      expect(result.annotations.map((copy) => annotationKey(copy.ref))).toEqual(
        copies.map((copy) => annotationKey(copy.ref)),
      );
      await annotation.whenSynced();
      // The plugin's own list holds its annotations: the square's copy is one more.
      expect(annotation.list()).toHaveLength(annotations + 1);
      expect(history.getUndoLabel()).toMatchObject({ key: 'annotation.duplicate' });

      // One step: every copy goes, and the originals are selected again.
      await booted.step('undo');
      await annotation.whenSynced();
      expect(booted.names()).toEqual(fields);
      expect(form.get(named('plan'))!.widgets).toHaveLength(1);
      expect(annotation.list()).toHaveLength(annotations);
      expect(annotation.selection.getSelected().map((each) => annotationKey(each.ref))).toEqual(
        originals.map(annotationKey),
      );
      await booted.step('redo');
      await annotation.whenSynced();
      expect(booted.names()).toEqual([...fields, 'city_2']);
      expect(form.get(named('plan'))!.widgets).toHaveLength(2);
      expect(annotation.list()).toHaveLength(annotations + 1);
    } finally {
      await booted.destroy();
    }
  });

  it('twice in a row copies the copy, before the engine answered the first', async () => {
    const booted = await boot();
    try {
      const { form, annotation, page } = booted;
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(72, 360) }] });
      booted.design();
      await annotation.whenSynced();
      annotation.selection.select(booted.widgetsOf(named('city')));

      booted.hold();
      const first = annotation.selection.duplicate();
      await staged();
      const second = annotation.selection.duplicate();
      await staged();
      expect(booted.names().slice(-2)).toEqual(['city_2', 'city_3']);
      // Each copy lands the same step from the one it copies.
      const [a, b, c] = ['city', 'city_2', 'city_3'].map(
        (name) => form.getWidgets(named(name))[0]!.box,
      );
      expect([c!.x - b!.x, c!.y - b!.y]).toEqual([b!.x - a!.x, b!.y - a!.y]);
      expect(b!.x - a!.x).toBe(10);
      await booted.release();
      await Promise.all([first, second]);
      expect(booted.names().slice(-2)).toEqual(['city_2', 'city_3']);
    } finally {
      await booted.destroy();
    }
  });

  it('is off for a locked widget, and without the right to design the form', async () => {
    const booted = await boot();
    try {
      const { form, annotation, page } = booted;
      await form.create({ kind: 'text', name: 'city', widgets: [{ page, rect: box(72, 360) }] });
      const [city] = booted.widgetsOf(named('city'));
      booted.design();
      await annotation.whenSynced();
      annotation.selection.select([city!]);
      expect(annotation.selection.canDuplicate()).toBe(true);
      await form.updateWidget(city!, { locked: true });
      expect(annotation.selection.canDuplicate()).toBe(false);
    } finally {
      await booted.destroy();
    }
  });
});
