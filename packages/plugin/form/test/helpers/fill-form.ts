/**
 * A form to fill in, for the fill suites: the change fixture with `a`, `b`, their `total` (a
 * calculate script) and a checkbox on its second page, and an engine whose answers the test
 * gives.
 */
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { CHANGE_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import type { Change, FormFieldDTO } from '@embedpdf/engine-core/runtime';

export const SUM =
  "event.value = Number(this.getField('a').value) + Number(this.getField('b').value);";

/** The fixture's form with `a`, `b`, their `total` and a checkbox on its second page. */
export async function formBytes(engine: Engine): Promise<Uint8Array> {
  const doc = await engine.open(
    { kind: 'bytes', id: 'author', bytes: CHANGE_FIXTURE_PDF.slice() },
    { scope: ['*'] },
  );
  const page = (await doc.pages.list()).pages[1]!.ref;
  const at = (y: number) => [{ page, rect: { x: 20, y, width: 120, height: 20 } }];
  for (const [name, y] of [
    ['a', 20],
    ['b', 50],
  ] as const) {
    await doc.forms.create({ family: 'text', name, defaultValue: '0', widgets: at(y) });
  }
  await doc.forms.create({
    family: 'text',
    name: 'total',
    readOnly: true,
    widgets: at(80),
    actions: { calculate: { type: 'javascript', script: SUM } },
  });
  await doc.forms.create({ family: 'checkbox', name: 'agree', widgets: at(110) });
  for (const name of ['a', 'b', 'total']) {
    await doc.forms.setValue({ kind: 'fqn', name }, { value: '0' });
  }
  const bytes = await doc.download();
  await doc.close();
  return bytes;
}

/** A change the engine is working on, held until the test answers it. */
export interface HeldChange {
  readonly change: Change;
  readonly options: unknown;
  resolve(result: unknown): void;
  reject(error: unknown): void;
}

/**
 * The engine, with the changes this session sends held until the test answers them, while
 * `holding()` says so; the others go straight to the engine.
 */
export function gated(
  engine: Engine,
  held: HeldChange[],
  opened: (doc: DocumentHandle) => void,
  holding: () => boolean = () => true,
): Engine {
  const gate = (doc: DocumentHandle): DocumentHandle =>
    new Proxy(doc, {
      get(target, prop) {
        if (prop === 'apply') {
          return (change: Change, options: unknown) =>
            holding()
              ? new Promise((resolve, reject) => held.push({ change, options, resolve, reject }))
              : target.apply(change, options as never);
        }
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === 'with' && typeof value === 'function') {
          return (...args: unknown[]) => gate(value.apply(target, args) as DocumentHandle);
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  return new Proxy(engine, {
    get(target, prop) {
      if (prop === 'open') {
        return async (...args: Parameters<Engine['open']>) => {
          const doc = await target.open(...args);
          opened(doc);
          return gate(doc);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const valueOf = (field: FormFieldDTO | null | undefined): string | boolean | undefined => {
  if (!field) return undefined;
  if (field.family === 'checkbox') return field.checked;
  return field.family === 'text' ? field.value : undefined;
};
