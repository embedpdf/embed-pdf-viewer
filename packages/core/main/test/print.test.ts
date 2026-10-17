import type { DocumentHandle, PageImageOptions, PageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createKernel } from '../src/kernel';
import {
  DocumentsToken,
  type AnyPlugin,
  type HostPrinter,
  type PluginContext,
  type PrintProgress,
  type PrintSheet,
} from '../src/types';
import { bytesInput, immediateEngine, makeHandle, page, settle } from './helpers';

/**
 * Printing as the Saving page describes it: `preparePrint()` waits for changes on their way,
 * draws each page by the print rules and stages the pictures with the host's printer; `print()`
 * opens the dialog inside the document's own print actions, and prepares again first when the
 * document changed since.
 */

const A: PageRef = { kind: 'objectNumber', objectNumber: 1 };
const B: PageRef = { kind: 'objectNumber', objectNumber: 2 };

/** A document of two pages whose renders, permissions and events the test controls. */
function printableHandle(allows: (permission: string) => boolean = () => true) {
  const handle = makeHandle('a', [page(1, 0), page(2, 1)]) as DocumentHandle & {
    events: { emit(event: unknown): void };
  };
  const renders: Array<{ page: PageRef; options: PageImageOptions }> = [];
  const image = vi.fn((ref: PageRef, options: PageImageOptions) => {
    renders.push({ page: ref, options });
    return Promise.resolve({
      blob: () =>
        Promise.resolve(new Blob([`page ${ref.kind === 'objectNumber' ? ref.objectNumber : ''}`])),
    });
  });
  Object.assign(handle, {
    security: { allows },
    page: (ref: PageRef) => ({
      render: { image: (options: PageImageOptions) => image(ref, options) },
    }),
  });
  return { handle, renders, image };
}

/** A printer that records what it was given and when its dialog opened. */
function recordingPrinter(log: string[] = []) {
  const staged: Array<{ sheets: readonly PrintSheet[]; name: string }> = [];
  const disposed: number[] = [];
  const printer: HostPrinter = {
    async stage(sheets, options) {
      const index = staged.push({ sheets, name: options.name }) - 1;
      return {
        print: async () => void log.push(`dialog ${index}`),
        dispose: () => void disposed.push(index),
      };
    },
  };
  return { printer, staged, disposed, log };
}

async function open(
  handle: DocumentHandle,
  options: { printer?: HostPrinter; plugins?: AnyPlugin[] } = {},
) {
  const kernel = createKernel({
    engine: immediateEngine({ a: handle }),
    plugins: options.plugins ?? [],
    ...(options.printer ? { printer: options.printer } : {}),
  });
  await kernel.start();
  await kernel.documents.open(bytesInput('a'), { name: 'Contract' });
  return kernel;
}

describe('printing', () => {
  it('without a printer nothing prints, and canPrint() says so', async () => {
    const { handle } = printableHandle();
    const kernel = await open(handle);
    expect(kernel.documents.canPrint()).toBe(false);
    expect(kernel.documents.getPrintQuality()).toBeNull();
    await expect(kernel.documents.preparePrint()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('refuses without doc.print before anything runs', async () => {
    const flush = vi.fn();
    const holder: AnyPlugin = {
      id: 'holder',
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => (ctx.onSettle(flush), { api: {} }),
    };
    const { handle, image } = printableHandle((permission) => permission !== 'doc.print');
    const { printer, staged } = recordingPrinter();
    const kernel = await open(handle, { printer, plugins: [holder] });
    expect(kernel.documents.canPrint()).toBe(false);
    const refused = await kernel.documents.print().catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: 'permission-denied', permission: 'doc.print' });
    expect(flush).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
    expect(staged).toHaveLength(0);
  });

  it('prints at 150 DPI with doc.print, and 300 with doc.print.high', async () => {
    const standard = printableHandle((permission) => permission !== 'doc.print.high');
    const kernel = await open(standard.handle, { printer: recordingPrinter().printer });
    expect(kernel.documents.getPrintQuality()).toEqual({ kind: 'images', dpi: 150 });
    const prepared = await kernel.documents.preparePrint();
    expect(prepared.quality).toBe(kernel.documents.getPrintQuality());
    expect(standard.renders.map((render) => render.options.viewport)).toEqual([
      { kind: 'dpi', dpi: 150 },
      { kind: 'dpi', dpi: 150 },
    ]);

    const high = printableHandle();
    const highKernel = await open(high.handle, { printer: recordingPrinter().printer });
    expect(highKernel.documents.getPrintQuality()).toEqual({ kind: 'images', dpi: 300 });
  });

  it('settles first, draws every page by the print rules, and stages them with their sizes', async () => {
    const order: string[] = [];
    const holder: AnyPlugin = {
      id: 'holder',
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => {
        ctx.onSettle(() => void order.push('settle'));
        return { api: {} };
      },
    };
    const { handle, renders, image } = printableHandle();
    image.mockImplementation((ref: PageRef, options: PageImageOptions) => {
      order.push(`render ${ref.kind === 'objectNumber' ? ref.objectNumber : ''}`);
      renders.push({ page: ref, options });
      return Promise.resolve({ blob: () => Promise.resolve(new Blob(['x'])) });
    });
    const { printer, staged } = recordingPrinter();
    const kernel = await open(handle, { printer, plugins: [holder] });
    const progress: PrintProgress[] = [];
    const prepared = await kernel.documents.preparePrint(undefined, {
      onProgress: (step) => progress.push(step),
    });

    expect(order).toEqual(['settle', 'render 1', 'render 2']);
    expect(renders[0]!.options).toEqual({
      usage: 'print',
      viewport: { kind: 'dpi', dpi: 300 },
      format: 'png',
    });
    expect(progress).toEqual([
      { pagesRendered: 0, pageCount: 2 },
      { pagesRendered: 1, pageCount: 2 },
      { pagesRendered: 2, pageCount: 2 },
    ]);
    expect(prepared.pageCount).toBe(2);
    expect(staged).toHaveLength(1);
    expect(staged[0]!.name).toBe('Contract');
    expect(staged[0]!.sheets.map(({ widthPt, heightPt }) => [widthPt, heightPt])).toEqual([
      [600, 800],
      [600, 800],
    ]);
  });

  it('prints the pages asked for, in their order, and refuses pages it does not have', async () => {
    const { handle, renders } = printableHandle();
    const kernel = await open(handle, { printer: recordingPrinter().printer });
    await kernel.documents.preparePrint(undefined, { pages: [B, A], includeAnnotations: false });
    expect(renders.map((render) => render.page)).toEqual([B, A]);
    expect(renders[0]!.options.includeAnnotations).toBe(false);

    await expect(
      kernel.documents.preparePrint(undefined, {
        pages: [{ kind: 'objectNumber', objectNumber: 9 }],
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(kernel.documents.preparePrint(undefined, { pages: [] })).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it('opens the dialog inside what plugins registered around it, the first registered outermost', async () => {
    const log: string[] = [];
    const wrapping = (name: string): AnyPlugin => ({
      id: name,
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => {
        ctx.aroundPrint(async (print) => {
          log.push(`${name}:before`);
          await print();
          log.push(`${name}:after`);
        });
        return { api: {} };
      },
    });
    const { handle } = printableHandle();
    const { printer, disposed } = recordingPrinter(log);
    const kernel = await open(handle, { printer, plugins: [wrapping('outer'), wrapping('inner')] });
    await kernel.documents.print();
    expect(log).toEqual(['outer:before', 'inner:before', 'dialog 0', 'inner:after', 'outer:after']);
    expect(disposed).toEqual([0]); // print() disposes what it prepared
  });

  it('prepares again before the dialog when the document changed since it was prepared', async () => {
    const { handle, image } = printableHandle();
    const { printer, staged, disposed, log } = recordingPrinter();
    const kernel = await open(handle, { printer });
    const prepared = await kernel.documents.preparePrint();
    expect(image).toHaveBeenCalledTimes(2);

    await prepared.print(); // nothing changed: the same pictures
    expect(log).toEqual(['dialog 0']);
    expect(image).toHaveBeenCalledTimes(2);

    handle.events.emit({ type: 'metadata.updated', origin: { kind: 'remote' } });
    await prepared.print();
    expect(image).toHaveBeenCalledTimes(4);
    expect(staged).toHaveLength(2);
    expect(disposed).toEqual([0]); // the stale pictures are freed
    expect(log).toEqual(['dialog 0', 'dialog 1']);

    prepared.dispose();
    expect(disposed).toEqual([0, 1]);
    await expect(prepared.print()).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('a signal cancels it while the pages are drawn', async () => {
    const { handle, image } = printableHandle();
    image.mockImplementation(() => new Promise(() => {}));
    const kernel = await open(handle, { printer: recordingPrinter().printer });
    const cancel = new AbortController();
    const preparing = kernel.documents.preparePrint(undefined, { signal: cancel.signal });
    await settle();
    cancel.abort();
    await expect(preparing).rejects.toMatchObject({ code: 'operation-cancelled' });
  });

  it('closing the document frees a prepared print', async () => {
    const { handle } = printableHandle();
    const { printer, disposed } = recordingPrinter();
    const kernel = await open(handle, { printer });
    await kernel.documents.preparePrint();
    await kernel.documents.close('a');
    expect(disposed).toEqual([0]);
  });

  it('in a document scope, prints the document in scope', async () => {
    const { handle } = printableHandle();
    const { printer, staged } = recordingPrinter();
    const kernel = await open(handle, { printer });
    await kernel.documents.open(bytesInput('b')); // b is now active
    const inA = kernel.capability(DocumentsToken, 'a');
    expect(inA.getPrintQuality()).toEqual({ kind: 'images', dpi: 300 });
    await inA.preparePrint();
    expect(staged[0]!.name).toBe('Contract');
  });
});
