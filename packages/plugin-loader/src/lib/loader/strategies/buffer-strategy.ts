import { PdfDocumentObject } from '@embedpdf/models';
import { PDFLoadingOptions, PDFLoadingStrategy } from './loading-strategy';

export class BufferStrategy implements PDFLoadingStrategy {
  async load(options: PDFLoadingOptions): Promise<PdfDocumentObject> {
    const { id, source, password, engine } = options;

    const task = engine.openDocument({
      id,
      content: source,
    }, password || '');

    return new Promise<PdfDocumentObject>((resolve, reject) => {
      task.wait(
        // Success callback
        (result) => resolve(result),
        // Error callback
        (error) => {
          if (error.type === 'abort') {
            reject(new Error(`PDF loading aborted: ${error.reason}`));
          } else {
            reject(new Error(`PDF loading failed: ${error.reason}`));
          }
        }
      );
    });
  }
} 