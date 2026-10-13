/**
 * A field shown in one more place, on a real engine (`addWidget()`): a radio group's new button
 * is its next choice and a checkbox's new box checks with it; the new widget goes next in line,
 * looks like the field's last one, and is one undo step; a merged field splits.
 */
import { createKernel, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type { FormFieldRef, PageRef, ToggleFieldWidget } from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

/** The fixture's merged text field and widget. */
const NAME: FormFieldRef = { kind: 'fqn', name: 'name' };

async function boot() {
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      annotationPlugin(),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open({
    kind: 'bytes',
    id: `add-widget-${Math.random()}`,
    bytes: CHANGE_FIXTURE_PDF.slice(),
  });
  const form = kernel.capability(FormToken);
  await form.refresh();
  const page = form.get(NAME)!.widgets[0]!.page as PageRef;
  /** A field's widgets' boxes, in its order. */
  const boxesOf = (ref: FormFieldRef) => form.getWidgets(ref).map((row) => row.box);
  return { kernel, form, page, boxesOf, history: kernel.capability(HistoryToken) };
}

const box = (x: number, y: number) => ({ x, y, width: 16, height: 16 });

describe('addWidget', () => {
  it("adds a radio group's next choice under its button, looking like it", async () => {
    const { kernel, form, page, boxesOf } = await boot();
    try {
      const plan: FormFieldRef = { kind: 'fqn', name: 'plan' };
      await form.create({
        family: 'radio',
        name: 'plan',
        widgets: [{ page, rect: box(72, 100), exportValue: 'Choice1', color: '#ff0000' }],
      });
      const { field, widget } = await form.addWidget(plan);
      expect(field.widgets.map((each) => (each as ToggleFieldWidget).exportValue)).toEqual([
        'Choice1',
        'Choice2',
      ]);
      expect(widget.box).toEqual(box(72, 124));
      expect(widget.color).toBe('#ff0000');
      // The third keeps the step.
      await form.addWidget(plan);
      expect(boxesOf(plan)).toEqual([box(72, 100), box(72, 124), box(72, 148)]);
    } finally {
      await kernel.destroy();
    }
  });

  it('continues a row beside its last button', async () => {
    const { kernel, form, page, boxesOf } = await boot();
    try {
      const size: FormFieldRef = { kind: 'fqn', name: 'size' };
      await form.create({
        family: 'radio',
        name: 'size',
        widgets: [
          { page, rect: box(72, 200), exportValue: 'small' },
          { page, rect: box(100, 200), exportValue: 'large' },
        ],
      });
      const { field } = await form.addWidget(size);
      expect(boxesOf(size).at(-1)).toEqual(box(128, 200));
      // The next free Choice<n>: none is taken yet.
      expect((field.widgets.at(-1) as ToggleFieldWidget).exportValue).toBe('Choice3');
    } finally {
      await kernel.destroy();
    }
  });

  it("gives a checkbox's new box its value, so they check together", async () => {
    const { kernel, form, page } = await boot();
    try {
      const agree: FormFieldRef = { kind: 'fqn', name: 'agree' };
      await form.create({
        family: 'checkbox',
        name: 'agree',
        widgets: [{ page, rect: box(72, 300) }],
      });
      const { field } = await form.addWidget(agree);
      const values = field.widgets.map((each) => (each as ToggleFieldWidget).exportValue);
      expect(values[1]).toBe(values[0]);
      await form.setValue(agree, { checked: true });
      expect(form.get(agree)!.widgets.map((each) => (each as ToggleFieldWidget).checked)).toEqual([
        true,
        true,
      ]);
    } finally {
      await kernel.destroy();
    }
  });

  it('takes a place and a value given, and is one undo step', async () => {
    const { kernel, form, page, history, boxesOf } = await boot();
    try {
      const pick: FormFieldRef = { kind: 'fqn', name: 'pick' };
      await form.create({
        family: 'radio',
        name: 'pick',
        widgets: [{ page, rect: box(72, 400), exportValue: 'a' }],
      });
      await form.addWidget(pick, { rect: box(300, 400), exportValue: 'b' });
      expect(boxesOf(pick)).toEqual([box(72, 400), box(300, 400)]);
      await history.undo();
      await form.refresh();
      expect(boxesOf(pick)).toEqual([box(72, 400)]);
    } finally {
      await kernel.destroy();
    }
  });

  it('splits a merged field: the field keeps its value and shows in both places', async () => {
    const { kernel, form, boxesOf } = await boot();
    try {
      const [first] = boxesOf(NAME);
      const { field } = await form.addWidget(NAME);
      expect(field.widgets).toHaveLength(2);
      const [moved, second] = boxesOf(NAME);
      // The field's own widget moved to a new number and kept its place.
      expect(moved).toEqual(first);
      // The fixture's page is 300pt tall: half a height below would leave it, and so would a
      // column beside it, so the new one stays on the page, at its foot.
      expect(second).toEqual({ ...first!, y: 300 - first!.height });
    } finally {
      await kernel.destroy();
    }
  });
});
