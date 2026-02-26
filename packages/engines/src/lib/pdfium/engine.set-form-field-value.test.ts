import { PdfiumNative } from './engine';
import { PDF_FORM_FIELD_TYPE } from '@embedpdf/models';

function waitTask(task: any): Promise<any> {
  return new Promise((resolve, reject) => {
    task.wait(resolve, (error: any) => reject(error?.reason ?? error));
  });
}

function createEngineMock(currentChecked: boolean) {
  const onChar = jest.fn(() => true);
  const isChecked = jest.fn(() => currentChecked);

  const engine = Object.create(PdfiumNative.prototype) as any;
  engine.logger = { debug: jest.fn(), perf: jest.fn() };
  engine.cache = {
    getContext: jest.fn(() => ({
      docPtr: 100,
      acquirePage: jest.fn(() => ({
        pagePtr: 200,
        release: jest.fn(),
      })),
    })),
  };
  engine.getAnnotationByName = jest.fn(() => 300);
  engine.pdfiumModule = {
    PDFiumExt_OpenFormFillInfo: jest.fn(() => 1),
    PDFiumExt_InitFormFillEnvironment: jest.fn(() => 2),
    FORM_OnAfterLoadPage: jest.fn(),
    FORM_SetFocusedAnnot: jest.fn(() => true),
    FPDFAnnot_IsChecked: isChecked,
    FORM_OnChar: onChar,
    FORM_ForceToKillFocus: jest.fn(),
    FPDFPage_CloseAnnot: jest.fn(),
    FORM_OnBeforeClosePage: jest.fn(),
    PDFiumExt_ExitFormFillEnvironment: jest.fn(),
    PDFiumExt_CloseFormFillInfo: jest.fn(),
  };

  return { engine, onChar, isChecked };
}

describe('PdfiumNative.setFormFieldValue checked behavior', () => {
  const doc = { id: 'doc-1' } as any;
  const page = { index: 0 } as any;
  const annotation = {
    id: 'w1',
    type: 0,
    field: { type: PDF_FORM_FIELD_TYPE.CHECKBOX },
  } as any;

  test('does not toggle when current state already matches requested state', async () => {
    const { engine, onChar } = createEngineMock(true);

    const task = engine.setFormFieldValue(doc, page, annotation, {
      kind: 'checked',
      isChecked: true,
    });
    await waitTask(task);

    expect(onChar).not.toHaveBeenCalled();
  });

  test('toggles exactly once when current state differs', async () => {
    const { engine, onChar } = createEngineMock(false);

    const task = engine.setFormFieldValue(doc, page, annotation, {
      kind: 'checked',
      isChecked: true,
    });
    await waitTask(task);

    expect(onChar).toHaveBeenCalledTimes(1);
  });

  test('requested unchecked from checked toggles exactly once', async () => {
    const { engine, onChar } = createEngineMock(true);

    const task = engine.setFormFieldValue(doc, page, annotation, {
      kind: 'checked',
      isChecked: false,
    });
    await waitTask(task);

    expect(onChar).toHaveBeenCalledTimes(1);
  });
});
