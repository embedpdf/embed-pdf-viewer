import type {
  DocumentHandle,
  PageExtractOptions,
  PageImageOptions,
  PageRef,
} from '@embedpdf/engine-core/runtime';
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
 * makes the pages as they print (the PDF copy where the rights and the printer allow it, else a
 * picture of each page) and stages them with the host's printer; `print()` opens the dialog
 * inside the document's own print actions, and prepares again first when the document changed
 * since.
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
  const copy = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const extract = vi.fn((_pages: PageRef[], _options: PageExtractOptions) => Promise.resolve(copy));
  Object.assign(handle, {
    security: { allows },
    pages: { ...handle.pages, extract },
    page: (ref: PageRef) => ({
      render: { image: (options: PageImageOptions) => image(ref, options) },
    }),
  });
  return { handle, renders, image, extract, copy };
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

/**
 * A printer that also prints a PDF, and records the copies it was given. `refuse` turns the PDF
 * down: when it is staged, or when its dialog would open.
 */
function pdfPrinter(log: string[] = [], refuse?: 'stage' | 'print') {
  const pictures = recordingPrinter(log);
  const pdfs: Array<{ pdf: Uint8Array; name: string }> = [];
  const printer: HostPrinter = {
    ...pictures.printer,
    async stagePdf(pdf, options) {
      if (refuse === 'stage') throw new Error('this browser shows no PDF in a frame');
      const index = pdfs.push({ pdf, name: options.name }) - 1;
      return {
        print: async () => {
          if (refuse === 'print') throw new Error('the PDF viewer is off');
          log.push(`pdf dialog ${index}`);
        },
        dispose: () => void log.push(`pdf disposed ${index}`),
      };
    },
  };
  return { ...pictures, printer, pdfs };
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

  it('a prepared print says whether its printer needs a tap to open the dialog', async () => {
    const anyTime = await open(printableHandle().handle, { printer: recordingPrinter().printer });
    expect((await anyTime.documents.preparePrint()).needsTap).toBe(false);

    const printer: HostPrinter = { ...recordingPrinter().printer, needsTap: true };
    const onATap = await open(printableHandle().handle, { printer });
    expect((await onATap.documents.preparePrint()).needsTap).toBe(true);
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
      includeAnnotations: true,
      includeFormFields: true,
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
    // Without the annotations, the form fields still print.
    expect(renders[0]!.options).toMatchObject({
      includeAnnotations: false,
      includeFormFields: true,
    });

    await expect(
      kernel.documents.preparePrint(undefined, {
        pages: [{ kind: 'objectNumber', objectNumber: 9 }],
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(kernel.documents.preparePrint(undefined, { pages: [] })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(
      kernel.documents.preparePrint(undefined, { pages: [A, B, A] }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
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

  it('prints the PDF copy with doc.print.high, a right to keep it, and a printer that prints PDFs', async () => {
    const { handle, extract, copy, image } = printableHandle();
    const { printer, pdfs, log } = pdfPrinter();
    const kernel = await open(handle, { printer });
    expect(kernel.documents.getPrintQuality()).toEqual({ kind: 'pdf' });

    const progress: PrintProgress[] = [];
    const prepared = await kernel.documents.preparePrint(undefined, {
      pages: [B],
      onProgress: (step) => progress.push(step),
    });
    expect(prepared.quality).toEqual({ kind: 'pdf' });
    expect(extract).toHaveBeenCalledWith([B], {
      flatten: { usage: 'print' },
      includeAnnotations: true,
      includeFormFields: true,
    });
    expect(image).not.toHaveBeenCalled();
    expect(pdfs).toEqual([{ pdf: copy, name: 'Contract' }]);
    expect(progress).toEqual([
      { pagesRendered: 0, pageCount: 1 },
      { pagesRendered: 1, pageCount: 1 },
    ]);
    await prepared.print();
    expect(log).toEqual(['pdf dialog 0']);
  });

  it('prints pictures without a right to keep the copy, or a printer that prints PDFs', async () => {
    const noDownload = printableHandle(
      (permission) => permission !== 'doc.download' && permission !== 'doc.download.flattened',
    );
    const kernel = await open(noDownload.handle, { printer: pdfPrinter().printer });
    expect(kernel.documents.getPrintQuality()).toEqual({ kind: 'images', dpi: 300 });

    const flattenedOnly = printableHandle((permission) => permission !== 'doc.download');
    const flattenedKernel = await open(flattenedOnly.handle, { printer: pdfPrinter().printer });
    expect(flattenedKernel.documents.getPrintQuality()).toEqual({ kind: 'pdf' });

    const standard = printableHandle((permission) => permission !== 'doc.print.high');
    const standardKernel = await open(standard.handle, { printer: pdfPrinter().printer });
    expect(standardKernel.documents.getPrintQuality()).toEqual({ kind: 'images', dpi: 150 });
  });

  it('prints pictures when the printer refuses the PDF copy after all', async () => {
    const { handle, renders } = printableHandle();
    const { printer, staged, log } = pdfPrinter([], 'print');
    const kernel = await open(handle, { printer });
    await kernel.documents.print();
    expect(renders.map((render) => render.options.viewport)).toEqual([
      { kind: 'dpi', dpi: 300 },
      { kind: 'dpi', dpi: 300 },
    ]);
    expect(staged).toHaveLength(1);
    expect(log).toEqual(['pdf disposed 0', 'dialog 0']);
  });

  it('prints pictures, and says so, when the printer turns the PDF copy down while preparing', async () => {
    const { handle, renders } = printableHandle();
    const { printer, staged, log } = pdfPrinter([], 'stage');
    const kernel = await open(handle, { printer });
    expect(kernel.documents.getPrintQuality()).toEqual({ kind: 'pdf' });
    const prepared = await kernel.documents.preparePrint();
    expect(prepared.quality).toEqual({ kind: 'images', dpi: 300 });
    expect(renders).toHaveLength(2);
    expect(staged).toHaveLength(1);
    await prepared.print();
    expect(log).toEqual(['dialog 0']);
  });
});
