import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createKernel, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import type {
  Annotation,
  AnnotationRef,
  Change,
  ChangeResult,
  DocumentHandle,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import {
  AnnotationToken,
  type AnnotationHostCapability,
} from '@embedpdf/plugin-annotation/contract/host';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { historyPlugin, HistoryToken, type HistoryCapability } from '../src';

/**
 * Every annotation action, undone and redone through the history on a real
 * engine: the records after an undo are the records before the action, both
 * in the engine and in the viewer, and after the redo the records after it.
 * Each action runs twice: once answered before the undo, and once with the
 * engine's answers held, so the undo is staged while the action is still on
 * its way and the viewer must show the records before it straight away.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, '../../../engine/main/test/fixtures/hello_world.pdf');

/** A stamp's drawing: one pixel. */
const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
);

const box = (x: number, y: number, width = 60, height = 40) => ({ x, y, width, height });

/**
 * The engine, with a gate in front of `doc.apply`: while it is held, every change waits, in
 * the order it came, and the engine answers them once it is let go.
 */
function gated(engine: Engine) {
  let waiting: (() => void)[] | null = null;
  let handle: DocumentHandle | null = null;
  const gate = (target: DocumentHandle): DocumentHandle =>
    new Proxy(target, {
      get(doc, name) {
        if (name === 'apply') {
          return (change: Change, options?: { opId?: string }): Promise<ChangeResult> => {
            if (!waiting) return doc.apply(change, options);
            const queue = waiting;
            return new Promise<void>((go) => queue.push(go)).then(() => doc.apply(change, options));
          };
        }
        const value = Reflect.get(doc, name, doc);
        return typeof value === 'function' ? value.bind(doc) : value;
      },
    });
  const wrapped = new Proxy(engine, {
    get(target, name) {
      if (name === 'open') {
        return (...args: Parameters<Engine['open']>) => {
          const task = target.open(...args);
          const opened = task.then((doc) => (handle = gate(doc)));
          return Object.assign(opened, { abort: task.abort?.bind(task) });
        };
      }
      const value = Reflect.get(target, name, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    engine: wrapped as Engine,
    handle: () => handle!,
    hold: () => {
      waiting = [];
    },
    release: () => {
      const queue = waiting ?? [];
      waiting = null;
      for (const go of queue) go();
    },
  };
}

/** A record as the comparison reads it: every field, numbers to a thousandth of a point. */
const factsOf = (annotations: readonly Annotation[], loose = false): unknown =>
  JSON.parse(
    JSON.stringify(annotations, (name, value: unknown) => {
      // What a prediction leaves as it was: the engine stamps it on every write.
      if (loose && (name === 'modifiedAt' || name === 'modifiedBy')) return undefined;
      return typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
    }),
  );

interface Booted {
  readonly annotation: AnnotationHostCapability;
  readonly history: HistoryCapability;
  readonly gate: ReturnType<typeof gated>;
  /** The records in the engine, every page. */
  truth(): Promise<unknown>;
  /** The records the viewer shows. */
  view(loose?: boolean): unknown;
  /** Wait until the viewer shows what the engine holds. */
  caughtUp(): Promise<void>;
  /** Undo or redo, and wait for the engine's answer and the viewer to show it. */
  step(direction: 'undo' | 'redo'): Promise<void>;
  destroy(): Promise<void>;
}

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

async function boot(): Promise<Booted> {
  const gate = gated(engine);
  const kernel = createKernel({
    engine: gate.engine,
    plugins: [interactionPlugin(), annotationPlugin(), historyPlugin()],
  });
  const bytes = new Uint8Array(await readFile(fixture));
  await kernel.documents.open({ kind: 'bytes', id: `history-${Math.random()}`, bytes });
  const annotation = kernel.capability(AnnotationToken);
  const history = kernel.capability(HistoryToken);
  await annotation.refresh();
  const truth = async () => factsOf((await gate.handle().annotations.list()).annotations);
  const view = (loose = false) => factsOf(annotation.list(), loose);
  const caughtUp = async () => {
    const expected = await truth();
    for (let tries = 0; tries < 200; tries += 1) {
      if (JSON.stringify(view()) === JSON.stringify(expected)) return;
      await new Promise((go) => setTimeout(go, 5));
    }
    expect(view()).toEqual(expected);
  };
  return {
    annotation,
    history,
    gate,
    truth,
    view,
    caughtUp,
    async step(direction) {
      const answered = new Promise<void>((done, fail) => {
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
      history[direction]();
      await answered;
      await caughtUp();
    },
    async destroy() {
      gate.release();
      await kernel.destroy();
    },
  };
}

/** One action: what it starts from (not part of the history), and the action itself. */
interface Action {
  readonly name: string;
  readonly setup?: (annotation: AnnotationHostCapability) => Promise<readonly AnnotationRef[]>;
  readonly act: (annotation: AnnotationHostCapability, refs: readonly AnnotationRef[]) => unknown;
  /** How long it takes to be staged in full, in ms: typing pauses. Default: at once. */
  readonly takes?: number;
}

const PAGE = 0;
const square = async (annotation: AnnotationHostCapability, x = 100) =>
  (await annotation.create(PAGE, { subtype: 'square', box: box(x, 100), color: '#2563eb' }))
    .annotation.ref;
const note = async (annotation: AnnotationHostCapability) =>
  (
    await annotation.create(PAGE, {
      subtype: 'text',
      rect: box(300, 300, 24, 24),
      contents: 'A note',
    })
  ).annotation.ref;

const ACTIONS: readonly Action[] = [
  {
    name: 'create a square',
    act: (annotation) => annotation.create(PAGE, { subtype: 'square', box: box(100, 100) }),
  },
  {
    name: 'create an ink drawing',
    act: (annotation) =>
      annotation.create(PAGE, {
        subtype: 'ink',
        inkList: [
          [
            { x: 100, y: 100 },
            { x: 140, y: 160 },
            { x: 180, y: 110 },
          ],
        ],
      }),
  },
  {
    name: 'create a free text',
    act: (annotation) =>
      annotation.create(PAGE, {
        subtype: 'free-text',
        box: box(100, 200, 160, 40),
        contents: 'Hello',
      }),
  },
  {
    name: 'place a stamp',
    act: (annotation) =>
      annotation.stamps.place(
        { source: PNG_1X1, targetWidth: 80 },
        { page: PAGE, center: { x: 200, y: 200 } },
      ),
  },
  {
    name: 'move an annotation',
    setup: async (annotation) => [await square(annotation)],
    act: (annotation, [ref]) => annotation.update(ref!, { subtype: 'square', box: box(220, 260) }),
  },
  {
    name: 'recolor an annotation',
    setup: async (annotation) => [await square(annotation)],
    act: (annotation, [ref]) => annotation.update(ref!, { subtype: 'square', color: '#e11d48' }),
  },
  {
    name: 'delete an annotation with its reply',
    setup: async (annotation) => {
      const ref = await note(annotation);
      await annotation.comments.reply(ref, 'A reply');
      return [ref];
    },
    act: (annotation, [ref]) => annotation.delete(ref!),
  },
  {
    name: 'reorder',
    setup: async (annotation) => [await square(annotation, 100), await square(annotation, 120)],
    act: (annotation, [first]) => annotation.reorder([first!], 'end'),
  },
  {
    name: 'recolor a selection',
    setup: async (annotation) => [await square(annotation, 100), await square(annotation, 200)],
    act: (annotation, refs) => {
      annotation.selection.set(refs);
      return annotation.selection.update({ color: '#16a34a' });
    },
  },
  {
    name: 'delete a selection',
    setup: async (annotation) => [await square(annotation, 100), await square(annotation, 200)],
    act: (annotation, refs) => {
      annotation.selection.set(refs);
      return annotation.selection.delete();
    },
  },
  {
    name: 'turn a selection',
    setup: async (annotation) => [await square(annotation)],
    act: (annotation, refs) => {
      annotation.selection.set(refs);
      return annotation.selection.rotateBy(90);
    },
  },
  {
    name: 'group a selection',
    setup: async (annotation) => [await square(annotation, 100), await square(annotation, 200)],
    act: (annotation, refs) => {
      annotation.selection.set(refs);
      return annotation.selection.group();
    },
  },
  {
    name: 'ungroup',
    setup: async (annotation) => {
      const refs = [await square(annotation, 100), await square(annotation, 200)];
      annotation.selection.set(refs);
      await annotation.selection.group();
      return refs;
    },
    act: (annotation, refs) => {
      annotation.selection.set(refs);
      return annotation.selection.ungroup();
    },
  },
  {
    name: 'link an annotation to a website',
    setup: async (annotation) => [await square(annotation)],
    act: (annotation, [ref]) =>
      annotation.links.set(ref!, { kind: 'uri', uri: 'https://www.embedpdf.com/' }),
  },
  {
    name: 'reply to a note',
    setup: async (annotation) => [await note(annotation)],
    act: (annotation, [ref]) => annotation.comments.reply(ref!, 'A reply'),
  },
  {
    name: 'set a review status',
    setup: async (annotation) => [await note(annotation)],
    act: (annotation, [ref]) => annotation.comments.setStatus(ref!, 'Accepted'),
  },
  {
    name: 'mark a comment',
    setup: async (annotation) => [await note(annotation)],
    act: (annotation, [ref]) => annotation.comments.setMarked(ref!, true),
  },
  {
    name: 'delete a thread',
    setup: async (annotation) => {
      const ref = await note(annotation);
      await annotation.comments.reply(ref, 'A reply');
      return [ref];
    },
    act: (annotation, [ref]) => annotation.comments.deleteThread(ref!),
  },
  {
    name: 'type into a text box, with pauses',
    setup: async (annotation) => [
      (
        await annotation.create(PAGE, {
          subtype: 'free-text',
          box: box(100, 200, 160, 40),
          contents: 'Hi',
        })
      ).annotation.ref,
    ],
    act: async (annotation, [ref]) => {
      annotation.text.begin(ref!);
      annotation.draftContents(ref!, 'Hi there');
      // A pause sends what was typed so far; the rest goes into the next change.
      await new Promise((go) => setTimeout(go, 300));
      annotation.draftContents(ref!, 'Hi there, you');
      // Ending the edit sends the rest: staged in full from here.
      void annotation.text.end();
    },
    takes: 400,
  },
];

describe.each(ACTIONS)('$name', (action) => {
  it('undoes to the records before it and redoes to the records after it', async () => {
    const booted = await boot();
    try {
      const { annotation, history } = booted;
      const refs = (await action.setup?.(annotation)) ?? [];
      await booted.caughtUp();
      annotation.selection.clear();
      history.clear();
      const before = await booted.truth();

      await action.act(annotation, refs);
      await booted.caughtUp();
      const after = await booted.truth();
      expect(after).not.toEqual(before);
      expect(history.canUndo()).toBe(true);

      await booted.step('undo');
      expect(await booted.truth()).toEqual(before);
      expect(booted.view()).toEqual(before);
      expect(history.canUndo()).toBe(false);

      await booted.step('redo');
      expect(await booted.truth()).toEqual(after);
      expect(booted.view()).toEqual(after);
    } finally {
      await booted.destroy();
    }
  });

  it('undoes while the action is still on its way, showing the records before it at once', async () => {
    const booted = await boot();
    try {
      const { annotation, history, gate } = booted;
      const refs = (await action.setup?.(annotation)) ?? [];
      await booted.caughtUp();
      annotation.selection.clear();
      history.clear();
      const before = await booted.truth();
      const shownBefore = booted.view(true);

      gate.hold();
      const acted = Promise.resolve(action.act(annotation, refs)).catch(() => {});
      // Typing sends its pauses later: wait until the action is staged in full.
      await Promise.race([acted, new Promise((go) => setTimeout(go, action.takes ?? 0))]);
      expect(history.canUndo()).toBe(true);
      const answered = new Promise<void>((done) => {
        const off = history.onUndone(() => {
          off();
          done();
        });
      });
      history.undo();
      // Nothing is answered yet: the viewer shows the undo's prediction.
      expect(booted.view(true)).toEqual(shownBefore);
      gate.release();
      await acted;
      await answered;
      await booted.caughtUp();
      expect(await booted.truth()).toEqual(before);
      expect(booted.view()).toEqual(before);

      await booted.step('redo');
      expect(await booted.truth()).not.toEqual(before);
    } finally {
      await booted.destroy();
    }
  });
});
