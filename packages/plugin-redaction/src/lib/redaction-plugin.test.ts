import { RedactionPlugin } from './redaction-plugin';
import { PdfAnnotationSubtype, PdfTaskHelper } from '@embedpdf/models';

function waitTask(task: any): Promise<any> {
  return new Promise((resolve, reject) => {
    task.wait(resolve, (error: any) => reject(error?.reason ?? error));
  });
}

describe('RedactionPlugin annotation mode cleanup behavior', () => {
  test('collectLinkedThreadAnnotationIds returns transitive linked replies', () => {
    const plugin = Object.create(RedactionPlugin.prototype) as any;
    plugin.annotationCapability = {
      forDocument: () => ({
        getState: () => ({
          byUid: {
            a: { object: { id: 'r1', pageIndex: 0, type: PdfAnnotationSubtype.REDACT } },
            b: {
              object: {
                id: 'c1',
                pageIndex: 0,
                type: PdfAnnotationSubtype.TEXT,
                inReplyToId: 'r1',
              },
            },
            c: {
              object: {
                id: 'c2',
                pageIndex: 0,
                type: PdfAnnotationSubtype.POPUP,
                inReplyToId: 'c1',
              },
            },
            d: { object: { id: 'x1', pageIndex: 0, type: PdfAnnotationSubtype.TEXT } },
          },
        }),
      }),
    };

    const result = plugin.collectLinkedThreadAnnotationIds('doc-1', ['r1']);
    expect(Array.from(result).sort()).toEqual(['c1', 'c2']);
  });

  test('applyRedactionAnnotationMode removes intersecting non-widget annotations and removes widgets', async () => {
    const purgeAnnotation = jest.fn();
    const purgeByMetadata = jest.fn();
    const dispatch = jest.fn();
    const dispatchCoreAction = jest.fn();
    const emit = jest.fn();
    const removePageAnnotation = jest.fn(() => PdfTaskHelper.resolve(true));
    const createPageAnnotation = jest.fn(() => PdfTaskHelper.resolve('new-id'));
    const applyRedaction = jest.fn(() => PdfTaskHelper.resolve(true));

    const plugin = Object.create(RedactionPlugin.prototype) as any;
    plugin.logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    plugin.dispatch = dispatch;
    plugin.dispatchCoreAction = dispatchCoreAction;
    plugin.events$ = { emit };
    plugin.annotationCapability = {
      forDocument: () => ({
        getAnnotationById: (id: string) =>
          id === 'r1'
            ? {
                object: {
                  id: 'r1',
                  pageIndex: 0,
                  type: PdfAnnotationSubtype.REDACT,
                  rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
                  segmentRects: [],
                },
              }
            : null,
        getState: () => ({
          byUid: {
            a: {
              object: {
                id: 'r1',
                pageIndex: 0,
                type: PdfAnnotationSubtype.REDACT,
              },
            },
            b: {
              object: {
                id: 'comment-1',
                pageIndex: 0,
                type: PdfAnnotationSubtype.TEXT,
                inReplyToId: 'r1',
              },
            },
          },
        }),
        purgeAnnotation,
      }),
    };
    plugin.historyCapability = {
      forDocument: () => ({
        purgeByMetadata,
      }),
    };
    plugin.engine = {
      getPageAnnotations: () =>
        PdfTaskHelper.resolve([
          {
            id: 'widget-1',
            pageIndex: 0,
            type: PdfAnnotationSubtype.WIDGET,
            rect: { origin: { x: 2, y: 2 }, size: { width: 3, height: 3 } },
          },
          {
            id: 'anno-1',
            pageIndex: 0,
            type: PdfAnnotationSubtype.HIGHLIGHT,
            rect: { origin: { x: 3, y: 3 }, size: { width: 3, height: 3 } },
          },
          {
            id: 'comment-1',
            pageIndex: 0,
            type: PdfAnnotationSubtype.TEXT,
            rect: { origin: { x: 100, y: 100 }, size: { width: 5, height: 5 } },
          },
          {
            id: 'unrelated-1',
            pageIndex: 0,
            type: PdfAnnotationSubtype.HIGHLIGHT,
            rect: { origin: { x: 200, y: 200 }, size: { width: 5, height: 5 } },
          },
        ]),
      removePageAnnotation,
      createPageAnnotation,
      applyRedaction,
    };

    const doc = { pages: [{ index: 0 }] } as any;
    const page = { index: 0 } as any;
    const result = plugin.applyRedactionAnnotationMode('doc-1', doc, page, 'r1');
    await waitTask(result);

    expect(removePageAnnotation).toHaveBeenCalledTimes(3);
    const removedIds = removePageAnnotation.mock.calls.map((call: any[]) => call[2].id).sort();
    expect(removedIds).toEqual(['anno-1', 'comment-1', 'widget-1']);

    expect(createPageAnnotation).not.toHaveBeenCalled();

    expect(applyRedaction).toHaveBeenCalledTimes(1);
    expect(purgeAnnotation).toHaveBeenCalled();
    expect(purgeByMetadata).toHaveBeenCalled();
  });

  test('applyRedactionAnnotationMode keeps unrelated non-intersecting annotations', async () => {
    const removePageAnnotation = jest.fn(() => PdfTaskHelper.resolve(true));
    const applyRedaction = jest.fn(() => PdfTaskHelper.resolve(true));

    const plugin = Object.create(RedactionPlugin.prototype) as any;
    plugin.logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    plugin.dispatch = jest.fn();
    plugin.dispatchCoreAction = jest.fn();
    plugin.events$ = { emit: jest.fn() };
    plugin.annotationCapability = {
      forDocument: () => ({
        getAnnotationById: (id: string) =>
          id === 'r1'
            ? {
                object: {
                  id: 'r1',
                  pageIndex: 0,
                  type: PdfAnnotationSubtype.REDACT,
                  rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
                  segmentRects: [],
                },
              }
            : null,
        getState: () => ({ byUid: { a: { object: { id: 'r1', pageIndex: 0, type: PdfAnnotationSubtype.REDACT } } } }),
        purgeAnnotation: jest.fn(),
      }),
    };
    plugin.historyCapability = { forDocument: () => ({ purgeByMetadata: jest.fn() }) };
    plugin.engine = {
      getPageAnnotations: () =>
        PdfTaskHelper.resolve([
          {
            id: 'widget-hit',
            pageIndex: 0,
            type: PdfAnnotationSubtype.WIDGET,
            rect: { origin: { x: 2, y: 2 }, size: { width: 3, height: 3 } },
          },
          {
            id: 'anno-hit',
            pageIndex: 0,
            type: PdfAnnotationSubtype.HIGHLIGHT,
            rect: { origin: { x: 3, y: 3 }, size: { width: 3, height: 3 } },
          },
          {
            id: 'unrelated-keep',
            pageIndex: 0,
            type: PdfAnnotationSubtype.HIGHLIGHT,
            rect: { origin: { x: 200, y: 200 }, size: { width: 10, height: 10 } },
          },
        ]),
      removePageAnnotation,
      applyRedaction,
    };

    const doc = { pages: [{ index: 0 }] } as any;
    const page = { index: 0 } as any;
    await waitTask(plugin.applyRedactionAnnotationMode('doc-1', doc, page, 'r1'));

    const removedIds = removePageAnnotation.mock.calls.map((call: any[]) => call[2].id).sort();
    expect(removedIds).toEqual(['anno-hit', 'widget-hit']);
  });

  test('applyRedactionAnnotationMode failure emits failed commit and does not purge state', async () => {
    const purgeAnnotation = jest.fn();
    const purgeByMetadata = jest.fn();
    const emit = jest.fn();

    const plugin = Object.create(RedactionPlugin.prototype) as any;
    plugin.logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    plugin.dispatch = jest.fn();
    plugin.dispatchCoreAction = jest.fn();
    plugin.events$ = { emit };
    plugin.annotationCapability = {
      forDocument: () => ({
        getAnnotationById: (id: string) =>
          id === 'r1'
            ? {
                object: {
                  id: 'r1',
                  pageIndex: 0,
                  type: PdfAnnotationSubtype.REDACT,
                  rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
                  segmentRects: [],
                },
              }
            : null,
        getState: () => ({ byUid: { a: { object: { id: 'r1', pageIndex: 0, type: PdfAnnotationSubtype.REDACT } } } }),
        purgeAnnotation,
      }),
    };
    plugin.historyCapability = { forDocument: () => ({ purgeByMetadata }) };
    plugin.engine = {
      getPageAnnotations: () => PdfTaskHelper.resolve([]),
      removePageAnnotation: jest.fn(() => PdfTaskHelper.resolve(true)),
      applyRedaction: jest.fn(() =>
        PdfTaskHelper.reject({ code: 500, message: 'apply failed' } as any),
      ),
    };

    const doc = { pages: [{ index: 0 }] } as any;
    const page = { index: 0 } as any;

    await expect(waitTask(plugin.applyRedactionAnnotationMode('doc-1', doc, page, 'r1'))).rejects.toBeDefined();
    expect(purgeAnnotation).not.toHaveBeenCalled();
    expect(purgeByMetadata).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'commit', documentId: 'doc-1', success: false }),
    );
  });
});
