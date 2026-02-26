import { RedactionPlugin } from './redaction-plugin';
import { PDF_FORM_FIELD_TYPE, PdfAnnotationSubtype, PdfTaskHelper } from '@embedpdf/models';

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

  test('applyRedactionAnnotationMode removes intersecting non-widget annotations and clears widgets', async () => {
    const purgeAnnotation = jest.fn();
    const purgeByMetadata = jest.fn();
    const dispatch = jest.fn();
    const dispatchCoreAction = jest.fn();
    const emit = jest.fn();
    const removePageAnnotation = jest.fn(() => PdfTaskHelper.resolve(true));
    const setFormFieldValue = jest.fn(() => PdfTaskHelper.resolve(true));
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
            field: {
              type: PDF_FORM_FIELD_TYPE.TEXTFIELD,
              options: [],
            },
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
        ]),
      removePageAnnotation,
      setFormFieldValue,
      applyRedaction,
    };

    const doc = { pages: [{ index: 0 }] } as any;
    const page = { index: 0 } as any;
    const result = plugin.applyRedactionAnnotationMode('doc-1', doc, page, 'r1');
    await waitTask(result);

    expect(removePageAnnotation).toHaveBeenCalledTimes(2);
    const removedIds = removePageAnnotation.mock.calls.map((call: any[]) => call[2].id).sort();
    expect(removedIds).toEqual(['anno-1', 'comment-1']);

    expect(setFormFieldValue).toHaveBeenCalledTimes(1);
    expect(setFormFieldValue.mock.calls[0][3]).toEqual({ kind: 'text', text: '' });

    expect(applyRedaction).toHaveBeenCalledTimes(1);
    expect(purgeAnnotation).toHaveBeenCalled();
    expect(purgeByMetadata).toHaveBeenCalled();
  });
});
