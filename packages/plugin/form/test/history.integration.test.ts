/**
 * Every fill, undone and redone through the history on a real engine with the form's real
 * scripts: after an undo the form is the form before the fill, calculations included, both in
 * the engine and in the view, and after the redo the form after it. Each fill runs once
 * answered before the undo, and once with the engine's answers held, so the undo is staged
 * while the fill is still on its way and the view must show the form before it at once. An
 * undo pressed before the fill's scripts finished takes the value back, and the total the
 * scripts were working out for it never lands.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createQuickJsSandbox } from '@embedpdf/core-js-sandbox';
import { createLocalEngine } from '@embedpdf/engine';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';
import { actionsPlugin } from '@embedpdf/plugin-actions';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken, type FormHostCapability } from '../src/host-contract';
import { formBytes, gated, valueOf, type HeldChange } from './helpers/fill-form';

const NAMES = ['a', 'b', 'total', 'agree'] as const;
const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });

let engine: Engine;
let bytes: Uint8Array;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  bytes = await formBytes(engine);
});
afterAll(async () => {
  await engine.destroy();
});

async function boot() {
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
      actionsPlugin({ javascript: { enabled: true, sandboxFactory: createQuickJsSandbox } }),
      formPlugin(),
      historyPlugin(),
    ],
  });
  await kernel.documents.open({ kind: 'bytes', id: `history-${Math.random()}`, bytes });
  const form = kernel.capability(FormToken);
  const history = kernel.capability(HistoryToken);
  await form.refresh();
  const doc = inner as DocumentHandle | null;
  if (!doc) throw new Error('the document did not open');

  const view = () => Object.fromEntries(NAMES.map((name) => [name, valueOf(form.get(ref(name)))]));
  const truth = async () => {
    const { fields } = await doc.forms.list();
    return Object.fromEntries(
      NAMES.map((name) => [name, valueOf(fields.find((field) => field.name === name))]),
    );
  };
  /** Wait until the view shows what the engine holds. */
  const caughtUp = async () => {
    const expected = await truth();
    for (let tries = 0; tries < 400; tries += 1) {
      if (JSON.stringify(view()) === JSON.stringify(expected)) return;
      await new Promise((go) => setTimeout(go, 5));
    }
    expect(view()).toEqual(expected);
  };
  const answeredStep = () =>
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
    });
  return {
    form,
    history,
    view,
    truth,
    caughtUp,
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
    held,
    async step(direction: 'undo' | 'redo') {
      const answered = answeredStep();
      history[direction]();
      await answered;
      await caughtUp();
    },
    answeredStep,
    destroy: () => kernel.destroy(),
  };
}

type Booted = Awaited<ReturnType<typeof boot>>;

/** One fill: what it starts from (not part of the history), and the fill itself. */
interface Fill {
  readonly name: string;
  readonly setup?: (form: FormHostCapability) => Promise<unknown>;
  readonly fill: (form: FormHostCapability) => Promise<unknown>;
}

const FILLS: Fill[] = [
  { name: 'a value, with its total', fill: (form) => form.setValue(ref('a'), { value: '5' }) },
  { name: 'a checkbox', fill: (form) => form.setValue(ref('agree'), { checked: true }) },
  {
    name: 'plain values, with one recalculation',
    fill: (form) =>
      form.setValues([
        { ref: ref('a'), value: { value: '3' } },
        { ref: ref('b'), value: { value: '4' } },
      ]),
  },
  {
    name: 'a reset, with its recalculation',
    setup: (form) =>
      form.setValues([
        { ref: ref('a'), value: { value: '3' } },
        { ref: ref('b'), value: { value: '4' } },
      ]),
    fill: (form) => form.reset([ref('a'), ref('b')]),
  },
];

/** Run the setup, outside the history, and wait until the scripts and the engine are done. */
async function start(booted: Booted, fill: Fill) {
  await fill.setup?.(booted.form);
  await booted.caughtUp();
  booted.history.clear();
  return { before: await booted.truth(), shownBefore: booted.view() };
}

describe.each(FILLS)('$name', (fill) => {
  it('undoes to the form before it and redoes to the form after it', async () => {
    const booted = await boot();
    try {
      const { before } = await start(booted, fill);
      await fill.fill(booted.form);
      await booted.caughtUp();
      const after = await booted.truth();
      expect(after).not.toEqual(before);
      expect(after.total).toBe(String(Number(after.a) + Number(after.b)));
      expect(booted.history.canUndo()).toBe(true);

      await booted.step('undo');
      expect(await booted.truth()).toEqual(before);
      expect(booted.view()).toEqual(before);
      expect(booted.history.canUndo()).toBe(false);

      await booted.step('redo');
      expect(await booted.truth()).toEqual(after);
      expect(booted.view()).toEqual(after);
    } finally {
      await booted.destroy();
    }
  });

  it('undoes while the fill is still on its way, showing the form before it at once', async () => {
    const booted = await boot();
    try {
      const { before, shownBefore } = await start(booted, fill);
      booted.hold();
      const filled = fill.fill(booted.form).catch(() => {});
      // The fill is in the history once its scripts ran and it was sent.
      for (let tries = 0; tries < 400 && booted.held.length === 0; tries += 1) {
        await new Promise((go) => setTimeout(go, 5));
      }
      expect(booted.history.canUndo()).toBe(true);
      const answered = booted.answeredStep();
      booted.history.undo();
      // Nothing is answered yet: the view shows the undo's prediction.
      expect(booted.view()).toEqual(shownBefore);
      await booted.release();
      await filled;
      await answered;
      await booted.caughtUp();
      expect(await booted.truth()).toEqual(before);
      expect(booted.view()).toEqual(before);
    } finally {
      await booted.destroy();
    }
  });
});

describe('an undo pressed before the scripts finished', () => {
  it('takes the value back, and the total worked out for it never lands', async () => {
    const booted = await boot();
    try {
      const { before } = await start(booted, FILLS[0]!);
      // The first fill loads the scripts: the undo is pressed while they load.
      const filled = booted.form.setValue(ref('a'), { value: '5' }).catch(() => {});
      expect(booted.view().a).toBe('5');
      // Its scripts are still running: the total isn't worked out yet. The undo sends it first.
      expect(booted.view().total).toBe(before.total);
      const answered = booted.answeredStep();
      booted.history.undo();
      expect(booted.view().a).toBe(before.a);
      await answered;
      await filled;
      await booted.caughtUp();
      // Long enough for a stale total to land, if one were on its way.
      await new Promise((go) => setTimeout(go, 50));
      await booted.caughtUp();
      expect(await booted.truth()).toEqual(before);
    } finally {
      await booted.destroy();
    }
  });
});
