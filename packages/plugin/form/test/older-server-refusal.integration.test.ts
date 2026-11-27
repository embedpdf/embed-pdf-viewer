/**
 * A server older than a field's purpose and format, as the cloud engine meets one: a change that
 * names either is refused with `NotImplemented` before anything is sent, with what it needs in
 * `details`, and so is an import of a bundle in which a field has a purpose. The plugin can't
 * know that before it asks, so the refusal is what an app meets,
 * and it is clean: the verb rejects `unsupported` with the engine's details, the field the view
 * showed is taken back, the engine holds nothing new, and nothing is left to undo. The engine
 * here is the real local one behind a door that refuses such a change the way the cloud engine
 * does.
 */
import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  type Change,
  type ChangeOp,
  type FormBundle,
  type FormFieldRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { historyPlugin, HistoryToken } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formPlugin } from '../src/form.plugin';
import { FormToken } from '../src/host-contract';

let engine: Engine;
beforeAll(async () => {
  engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
});
afterAll(async () => {
  await engine.destroy();
});

const ref = (name: string): FormFieldRef => ({ kind: 'fqn', name });

/** The fact of a field an older server lacks that this op names, as the cloud engine finds it. */
function factNamedBy(op: ChangeOp): 'purpose' | 'format' | null {
  const write =
    op.type === 'forms.create' ? op.draft : op.type === 'forms.update' ? op.patch : undefined;
  for (const fact of ['purpose', 'format'] as const) {
    if (write && (write as Record<string, unknown>)[fact] !== undefined) return fact;
  }
  return null;
}

/** The cloud engine's refusal of a fact the server is too old for. */
const refusal = (fact: 'purpose' | 'format') =>
  new EngineError(
    EngineErrorCode.NotImplemented,
    `a field's ${fact} needs a server of version 3.4, and this server is 3.3`,
    { details: { field: fact, needs: '3.4', serverVersion: '3.3' } },
  );

/**
 * The engine as a client of an older server has it: a change that names a purpose or a format
 * is refused before it goes anywhere, and so is an import of a bundle in which a field has a
 * purpose; every other change goes through. `refused` counts the refusals and `passed` the
 * changes that went on.
 */
function olderServer(inner: Engine, seen: { refused: number; passed: number }): Engine {
  const door = (doc: DocumentHandle): DocumentHandle =>
    new Proxy(doc, {
      get(target, prop) {
        if (prop === 'apply') {
          return (change: Change, options: unknown) => {
            const fact =
              'ops' in change ? (change.ops.map(factNamedBy).find(Boolean) ?? null) : null;
            if (fact) {
              seen.refused += 1;
              return Promise.reject(refusal(fact));
            }
            seen.passed += 1;
            return target.apply(change, options as never);
          };
        }
        if (prop === 'forms') {
          return new Proxy(target.forms, {
            get(forms, key) {
              if (key === 'import') {
                return (bundle: FormBundle, options: unknown) => {
                  // Such a server would make the field without its purpose, and not say so.
                  if (bundle.fields.some(({ data }) => (data.purpose ?? null) !== null)) {
                    seen.refused += 1;
                    return Promise.reject(refusal('purpose'));
                  }
                  return forms.import(bundle, options as never);
                };
              }
              const value = Reflect.get(forms, key, forms) as unknown;
              return typeof value === 'function' ? value.bind(forms) : value;
            },
          });
        }
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'with' && typeof value === 'function') {
          return (...args: unknown[]) => door(value.apply(target, args) as DocumentHandle);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  let opened: DocumentHandle | null = null;
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'open') {
        return async (...args: Parameters<Engine['open']>) => {
          opened = await target.open(...args);
          return door(opened);
        };
      }
      // The engine's own handle, for reading what the file really holds.
      if (prop === 'truth') return () => opened;
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

describe('a server that refuses a field’s purpose and format, after the fact', () => {
  it('create(), update(), a tool and import() leave nothing behind, and say why', async () => {
    // A form made where both are known, with one field that has a purpose already.
    const author = await engine.open(
      { kind: 'bytes', id: 'author', bytes: CHANGE_FIXTURE_PDF.slice() },
      { scope: ['*'] },
    );
    const first = (await author.pages.list()).pages[0]!.ref;
    await author.forms.create({
      kind: 'text',
      name: 'day',
      purpose: 'name',
      widgets: [{ page: first, rect: { x: 40, y: 40, width: 160, height: 24 } }],
    });
    const bytes = await author.download();
    await author.close();

    const seen = { refused: 0, passed: 0 };
    const older = olderServer(engine, seen);
    const kernel = createKernel({
      engine: older,
      plugins: [interactionPlugin(), annotationPlugin(), formPlugin(), historyPlugin()],
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await kernel.documents.open({ kind: 'bytes', id: 'older', bytes }, { scope: ['*'] } as never);
      const form = kernel.capability(FormToken);
      const interaction = kernel.capability(InteractionToken);
      const history = kernel.capability(HistoryToken);
      await form.refresh();
      const page = kernel.documents.getPage(0)!.ref as PageRef;
      await form.ensureLoaded(page);
      const truth = async () =>
        (await (older as unknown as { truth(): DocumentHandle }).truth().forms.list()).fields.map(
          (field) => `${field.name}:${field.purpose}`,
        );
      const before = await truth();
      const names = () => form.list().map((field) => field.name);
      const fieldsBefore = names();

      // What an app hears: the field events, and what its own state shows on the way.
      const events: string[] = [];
      form.onFieldCreated(({ field }) => events.push(`created ${field.name}`));
      form.onFieldUpdated(({ field }) => events.push(`updated ${field.name}`));
      form.onFieldDeleted(() => events.push('deleted'));
      const shown = new Set<string>();
      const stop = kernel.subscribe(() => {
        for (const name of names()) if (!fieldsBefore.includes(name)) shown.add(name);
        const day = form.get(ref('day'));
        if (day && day.purpose !== 'name') shown.add(`day as ${day.purpose}`);
      });

      // create(): rejects `unsupported`, with what the engine said it needs.
      const widgets = [{ page, rect: { x: 40, y: 100, width: 160, height: 24 } }];
      const created = form.create({ kind: 'text', name: 'who', purpose: 'name', widgets });
      await expect(created).rejects.toMatchObject({
        code: 'unsupported',
        capability: 'form',
        message: "a field's purpose needs a server of version 3.4, and this server is 3.3",
        details: { field: 'purpose', needs: '3.4', serverVersion: '3.3' },
      });
      // The field showed until the refusal came, and is taken back.
      expect(shown.has('who')).toBe(true);
      expect(names()).toEqual(fieldsBefore);
      expect(history.canUndo()).toBe(false);

      // update(): the same, and the field is as it was.
      shown.clear();
      await expect(form.update(ref('day'), { purpose: 'email' })).rejects.toMatchObject({
        code: 'unsupported',
        details: { field: 'purpose', needs: '3.4' },
      });
      await expect(
        form.update(ref('day'), { format: { kind: 'date', pattern: 'dd/mm/yyyy' } }),
      ).rejects.toMatchObject({ code: 'unsupported', details: { field: 'format', needs: '3.4' } });
      expect(shown.has('day as email')).toBe(true);
      expect(form.get(ref('day'))).toMatchObject({ purpose: 'name', format: null });
      expect(history.canUndo()).toBe(false);

      // A tool whose field has a purpose: the press places a field the server then refuses.
      shown.clear();
      interaction.activateTool('form-name');
      const sample = (phase: 'down' | 'up') => ({
        phase,
        viewport: { x: 0, y: 0 },
        page: { ref: page, point: { x: 120, y: 300 } },
        modifiers: { shift: false, alt: false, ctrl: false, meta: false },
      });
      interaction.dispatchPointer(sample('down'));
      interaction.dispatchPointer(sample('up'));
      await vi.waitFor(() => expect(seen.refused).toBe(4));
      await vi.waitFor(() => expect(names()).toEqual(fieldsBefore));
      // It showed for a moment; nothing is left to select, undo or save.
      expect(shown.has('text_1')).toBe(true);
      expect(history.canUndo()).toBe(false);
      // The app hears of it only through the console: a press has no promise to reject.
      await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1));
      expect(logged.mock.calls[0]![0]).toBe('[form] placing the field failed:');
      expect(logged.mock.calls[0]![1]).toMatchObject({ code: 'unsupported' });

      // import(): a bundle in which a field has a purpose is refused whole.
      const bundle = await form.export();
      expect(bundle.fields.map(({ data }) => data.purpose)).toContain('name');
      await expect(form.import(bundle)).rejects.toMatchObject({
        code: 'unsupported',
        details: { field: 'purpose', needs: '3.4', serverVersion: '3.3' },
      });
      expect(names()).toEqual(fieldsBefore);
      expect(history.canUndo()).toBe(false);
      expect(logged).toHaveBeenCalledTimes(1);

      // No field event fired for anything refused, and the engine holds what it held.
      expect(events).toEqual([]);
      expect(await truth()).toEqual(before);
      expect(seen).toEqual({ refused: 5, passed: 0 });

      // A write that names neither goes through, and is the one step to undo.
      await form.update(ref('day'), { required: true });
      expect(events).toEqual(['updated day']);
      expect(seen.passed).toBe(1);
      expect(history.canUndo()).toBe(true);
      stop();
    } finally {
      logged.mockRestore();
      kernel.destroy();
    }
  });
});
