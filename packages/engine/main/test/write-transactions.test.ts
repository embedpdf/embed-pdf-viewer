/**
 * Every write runs as one layer transaction. A write that fails after all of
 * its work, before its commit, leaves the document as it was: the same saved
 * objects (only the trailer's `/Size` may grow, counting the object numbers
 * the failed write used), the same page revisions, and a session that takes
 * the same write again. A commit that fails makes the session unusable.
 *
 * The failure is forced at the check the session makes before it keeps a
 * transaction (`EPDFLayer_IsInTransaction`), which every write type reaches
 * only after doing its work. Annotation imports also fail at every native pass
 * in `annotation-import.test.ts`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  measureFromKnownLength,
  type AnnotationRef,
  type AttachmentRef,
  type FormFieldRef,
  type PageRef,
} from '@embedpdf/engine-core';
import { createPdfRuntime, type PdfRuntimeModule } from '@embedpdf/engine-runtime';
import { LocalEngine } from '../src/LocalEngine';
import { InlineTransport } from '../src/transport/InlineTransport';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFile(resolve(here, 'fixtures', name));

/** The runtime, with one native call made to throw once when armed. */
function failing(runtime: PdfRuntimeModule) {
  let armed: string | null = null;
  let fired = false;
  const fn = new Proxy(runtime.fn, {
    get(target, name, receiver) {
      const original = Reflect.get(target, name, receiver) as unknown;
      if (name !== armed || typeof original !== 'function') return original;
      return () => {
        armed = null;
        fired = true;
        throw new Error(`forced failure in ${String(name)}`);
      };
    },
  });
  return {
    runtime: Object.create(runtime, { fn: { value: fn } }) as PdfRuntimeModule,
    arm(name: string) {
      armed = name;
      fired = false;
    },
    fired: () => fired,
  };
}

/** A save with what may differ between equal documents blanked: the second id and `/Size`. */
function comparable(bytes: Uint8Array): string {
  return new TextDecoder('latin1')
    .decode(bytes)
    .replace(/\/ID\s*\[\s*<[0-9A-Fa-f]*>\s*<[0-9A-Fa-f]*>\s*\]/g, '/ID[]')
    .replace(/\/Size \d+/g, '/Size _');
}

const fqn = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const rect = (x: number) => ({ x, y: 40, width: 40, height: 30 });

describe.each(['wasm', 'native'] as const)(
  'every write is one transaction (%s runtime)',
  (prefer) => {
    async function open() {
      const fault = failing(await createPdfRuntime({ prefer }));
      const engine = LocalEngine.fromTransport({ transport: new InlineTransport(fault.runtime) });
      const doc = await engine.open(
        {
          kind: 'bytes',
          id: `tx-${prefer}`,
          bytes: new Uint8Array(await fixture('hello_world.pdf')),
        },
        { scope: ['*'] },
      );
      const firstPage: PageRef = (await doc.pages.list()).pages[0]!.ref;
      return { fault, engine, doc, firstPage };
    }

    test('a write that fails before its commit leaves nothing behind, and applies afterwards', async () => {
      const { fault, engine, doc, firstPage } = await open();
      const artwork = new Uint8Array(await fixture('signature_artwork.pdf'));
      const page = doc.page(firstPage);
      let n = 0;
      let square: AnnotationRef | null = null;
      let victim: AnnotationRef | null = null;
      let redact: AnnotationRef | null = null;
      let widget: AnnotationRef | null = null;
      let attachment: AttachmentRef | null = null;
      let blank: PageRef | null = null;
      const circle = async (x: number) =>
        (await page.annotations.create({ subtype: 'circle', box: rect(x) })).annotation.ref;

      /** Each write fails once and then applies; `setup` runs first, unarmed. */
      const writes: Array<{
        what: string;
        setup?: () => Promise<unknown>;
        write: () => Promise<unknown>;
      }> = [
        { what: 'metadata.update', write: () => doc.metadata.update({ title: `title ${++n}` }) },
        {
          what: 'metadata.updateCustom',
          write: () => doc.metadata.custom.update({ Probe: `value ${++n}` }),
        },
        {
          what: 'annotations.create',
          write: async () => {
            square = (await page.annotations.create({ subtype: 'square', box: rect(20) }))
              .annotation.ref;
          },
        },
        {
          what: 'annotations.update',
          write: () => page.annotations.update(square!, { box: rect(20 + ++n) }),
        },
        {
          what: 'annotations.move',
          setup: () => circle(70),
          write: () => page.annotations.move([square!], 1),
        },
        {
          what: 'annotations.flatten',
          write: () => page.annotations.flatten([square!], { usage: 'display' }),
        },
        {
          what: 'annotations.delete',
          setup: async () => {
            victim = await circle(120);
          },
          write: () => page.annotations.delete(victim!),
        },
        {
          what: 'forms.create',
          write: () =>
            doc.forms.create({
              family: 'text',
              name: 'probe',
              widgets: [{ page: firstPage, rect: rect(160) }],
            }),
        },
        {
          what: 'forms.setValue',
          write: () => doc.forms.setValue(fqn('probe'), { value: `value ${++n}` }),
        },
        {
          what: 'forms.applyEffects',
          write: () =>
            doc.forms.applyEffects([
              { kind: 'setValue', ref: fqn('probe'), value: { value: `effect ${++n}` } },
            ]),
        },
        { what: 'forms.reset', write: () => doc.forms.reset(fqn('probe')) },
        {
          what: 'forms.import',
          write: () =>
            doc.forms.import(
              new TextEncoder().encode(
                `<?xml version="1.0"?><xfdf xmlns="http://ns.adobe.com/xfdf/"><fields><field name="probe"><value>imported ${++n}</value></field></fields></xfdf>`,
              ),
              'xfdf',
            ),
        },
        {
          what: 'forms.update',
          write: () => doc.forms.update(fqn('probe'), { required: ++n % 2 === 0 }),
        },
        {
          what: 'forms.addWidget',
          write: async () => {
            const { field } = await doc.forms.addWidget(fqn('probe'), {
              page: firstPage,
              rect: rect(210),
            });
            widget = field.widgets.at(-1)!.ref;
          },
        },
        { what: 'forms.removeWidget', write: () => doc.forms.removeWidget(fqn('probe'), widget!) },
        {
          what: 'forms.setSignatureAppearance',
          setup: () =>
            doc.forms.create({
              family: 'signature',
              name: 'sig',
              widgets: [{ page: firstPage, rect: rect(260) }],
            }),
          write: () => doc.forms.setSignatureAppearance(fqn('sig'), { pdf: artwork }),
        },
        { what: 'forms.delete', write: () => doc.forms.delete(fqn('probe')) },
        { what: 'forms.repair', write: () => doc.forms.repair() },
        {
          what: 'pages.insertBlank',
          write: async () => {
            const { layout } = await doc.pages.insertBlank({ size: { width: 200, height: 200 } });
            blank = layout.pages.at(-1)!.ref;
          },
        },
        { what: 'pages.rotate', write: () => doc.pages.rotate([blank!], 90) },
        { what: 'pages.move', write: () => doc.pages.move([blank!], 0) },
        {
          what: 'pages.setName',
          write: () => doc.pages.setName({ name: 'probe', page: firstPage }),
        },
        { what: 'pages.removeName', write: () => doc.pages.removeName({ name: 'probe' }) },
        {
          what: 'pages.flatten',
          write: () => doc.pages.flatten([firstPage], { usage: 'display' }),
        },
        { what: 'pages.delete', write: () => doc.pages.delete([blank!]) },
        {
          what: 'pages.insert',
          write: async () => doc.pages.insert(new Uint8Array(await fixture('hello_world.pdf'))),
        },
        {
          what: 'redaction.apply',
          setup: async () => {
            redact = (await page.annotations.create({ subtype: 'redact', rect: rect(300) }))
              .annotation.ref;
          },
          write: () => doc.redaction.apply({ annotations: [redact!] }),
        },
        {
          what: 'attachments.create',
          write: async () => {
            const data = new File([new Uint8Array([1, 2, 3])], 'probe.csv', { type: 'text/csv' });
            attachment = (await doc.attachments.create({ data })).attachment.ref;
          },
        },
        { what: 'attachments.delete', write: () => doc.attachments.delete(attachment!) },
        {
          what: 'measure.setScale',
          write: () =>
            page.measure.setScale(measureFromKnownLength(100 + ++n, { value: 3, unit: 'm' })),
        },
        {
          what: 'pieceInfo.update',
          write: () => doc.pieceInfo.update('EMBD_Probe', { name: `piece ${++n}` }),
        },
        { what: 'pieceInfo.delete', write: () => doc.pieceInfo.delete('EMBD_Probe') },
      ];

      const state = async () => ({
        save: comparable(await doc.download({ mode: 'incremental' })),
        annotations: await page.annotations.list(),
        fields: await doc.forms.list(),
        pages: await doc.pages.list(),
      });

      try {
        const problems: string[] = [];
        for (const { what, setup, write } of writes) {
          await setup?.();
          const before = await state();
          fault.arm('EPDFLayer_IsInTransaction');
          const failed = await write().then(
            () => null,
            (error: unknown) => error,
          );
          if (!fault.fired()) problems.push(`${what}: never reached its commit`);
          if (!(failed instanceof Error)) problems.push(`${what}: was not refused`);
          const after = await state();
          for (const part of Object.keys(before) as Array<keyof typeof before>) {
            if (!isDeepStrictEqual(after[part], before[part]))
              problems.push(`${what}: left ${part} changed`);
          }
          await write();
        }
        expect(problems).toEqual([]);
      } finally {
        await engine.destroy();
      }
    }, 120_000);

    test('a commit that fails makes the session unusable', async () => {
      const { fault, engine, doc, firstPage } = await open();
      try {
        fault.arm('EPDFLayer_CommitTransaction');
        await expect(
          doc.page(firstPage).annotations.create({ subtype: 'square', box: rect(20) }),
        ).rejects.toBeInstanceOf(Error);
        expect(fault.fired()).toBe(true);
        const after = await doc.pages.list().then(
          () => null,
          (error: unknown) => error,
        );
        expect(EngineError.is(after, EngineErrorCode.DocNotOpen)).toBe(true);
      } finally {
        await engine.destroy();
      }
    });
  },
);
