import {
  PdfErrorCode,
  PdfTaskHelper,
  type IPdfiumExecutor,
  type PdfDocumentObject,
} from '@embedpdf/models';
import { PdfEngine, type PdfEngineOptions } from '../src/lib/orchestrator/pdf-engine';

const document: PdfDocumentObject = {
  id: 'book',
  pageCount: 0,
  pages: [],
  isEncrypted: false,
  isOwnerUnlocked: true,
  permissions: 0xffffffff,
  normalizedRotation: false,
};

function create_engine(options: Partial<PdfEngineOptions<Blob>> = {}) {
  const executor = {
    supportsRangeLoading: true,
    openDocumentUrl: jest.fn(() => PdfTaskHelper.resolve(document)),
    openDocumentBuffer: jest.fn(() => PdfTaskHelper.resolve(document)),
  };
  const engine = new PdfEngine(executor as unknown as IPdfiumExecutor, {
    imageConverter: async () => new Blob(),
    ...options,
  });
  return { engine, executor };
}

afterEach(() => {
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'location');
});

describe('PdfEngine URL loading', () => {
  it('routes eligible URL documents to the worker executor', async () => {
    const { engine, executor } = create_engine();

    await engine.openDocumentUrl({ id: 'book', url: 'book.pdf' }).toPromise();

    expect(executor.openDocumentUrl).toHaveBeenCalledWith(
      { id: 'book', url: 'book.pdf' },
      undefined,
    );
    expect(executor.openDocumentBuffer).not.toHaveBeenCalled();
  });

  it.each([{ mode: 'full-fetch' as const }, { requestOptions: { credentials: 'omit' as const } }])(
    'keeps $mode$requestOptions on the full-fetch path',
    async (options) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(Uint8Array.from([1, 2, 3])));
      const { engine, executor } = create_engine();

      await engine.openDocumentUrl({ id: 'book', url: 'book.pdf' }, options).toPromise();

      expect(executor.openDocumentUrl).not.toHaveBeenCalled();
      expect(executor.openDocumentBuffer).toHaveBeenCalled();
    },
  );

  it('preserves custom fetchers instead of bypassing them in the worker', async () => {
    const fetcher = jest.fn(async () => new Response(Uint8Array.from([1, 2, 3])));
    const { engine, executor } = create_engine({ fetcher: fetcher as typeof fetch });

    await engine
      .openDocumentUrl({ id: 'book', url: 'book.pdf' }, { mode: 'range-request' })
      .toPromise();

    expect(fetcher).toHaveBeenCalledWith('book.pdf', undefined);
    expect(executor.openDocumentUrl).not.toHaveBeenCalled();
    expect(executor.openDocumentBuffer).toHaveBeenCalled();
  });

  it('rejects malformed URLs through the returned task', async () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'https://example.com/viewer' },
    });
    const { engine } = create_engine();

    const task = engine.openDocumentUrl({ id: 'book', url: 'http://[' });

    await expect(task.toPromise()).rejects.toMatchObject({
      reason: { code: PdfErrorCode.Unknown, message: expect.stringContaining('Invalid URL') },
    });
  });
});
