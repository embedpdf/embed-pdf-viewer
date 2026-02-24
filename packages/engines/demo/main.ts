import {
  ConsoleLogger,
  ignore,
  PdfDocumentObject,
  PdfEngineError,
  PdfTaskHelper,
} from '@embedpdf/models';
import { WebWorkerEngine } from '../src/index';
import pdfiumWasm from 'url:@embedpdf/pdfium/pdfium.wasm';

async function loadWasmBinary() {
  const response = await fetch(pdfiumWasm);
  const wasmBinary = await response.arrayBuffer();
  return wasmBinary;
}

async function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };

    reader.readAsArrayBuffer(file);
  });
}

function logError(error: PdfEngineError) {
  console.error(error);
}

async function run() {
  const logger = new ConsoleLogger();
  const worker = new Worker(new URL('./webworker.ts', import.meta.url), {
    type: 'module',
  });
  const engine = new WebWorkerEngine(worker, logger);

  const passwordElem = document.getElementById('pdf-password') as HTMLInputElement;
  const inputElem = document.getElementById('pdf-file') as HTMLInputElement;
  const bookmarksElem = document.getElementById('pdf-bookmarks') as HTMLParagraphElement;
  const saveElem = document.getElementById('save') as HTMLInputElement;

  let currDoc: PdfDocumentObject | null = null;
  inputElem?.addEventListener('input', async (evt) => {
    const closeTask = currDoc ? engine.closeDocument(currDoc) : PdfTaskHelper.resolve(true);
    currDoc = null;

    closeTask.wait(async () => {
      const file = (evt.target as HTMLInputElement).files?.[0];
      if (file) {
        const arrayBuffer = await readFile(file);
        const password = passwordElem.value;
        const task = engine.openDocument(
          { id: file.name, name: file.name, content: arrayBuffer },
          password,
        );
        task.wait(
          (doc) => {
            currDoc = doc;

            const task = engine.getBookmarks(doc);
            task.wait((bookmarks) => {
              console.log(bookmarks);
            }, logError);

            for (let i = 0; i < doc.pageCount; i++) {
              const page = doc.pages[i];

              const renderTask = engine.renderPage(doc, page, 1, 0, window.devicePixelRatio, {
                withAnnotations: true,
              });
              renderTask.wait((imageData) => {
                const canvasElem = document.createElement('canvas') as HTMLCanvasElement;
                const rootElem = document.getElementById('root') as HTMLDivElement;
                rootElem.appendChild(canvasElem);
                canvasElem.style.width = `${page.size.width}px`;
                canvasElem.style.height = `${page.size.height}px`;
                canvasElem.width = imageData.width;
                canvasElem.height = imageData.height;

                const ctx = canvasElem.getContext('2d');
                ctx?.putImageData(imageData, 0, 0, 0, 0, imageData.width, imageData.height);
                console.log(imageData);
              }, logError);

              const annotationsTask = engine.getPageAnnotations(doc, page, 1, 0);
              annotationsTask.wait((annotations) => {
                console.log(page.index, annotations);
              }, logError);

              const textRectsTask = engine.getPageTextRects(doc, page, 1, 0);
              textRectsTask.wait((textRects) => {
                console.log(page.index, textRects);
              }, logError);
            }
          },
          () => {
            currDoc = null;
          },
        );
      }
    }, logError);
  });

  saveElem.addEventListener('click', async () => {
    if (currDoc) {
      engine.saveAsCopy(currDoc).wait((buffer) => {
        const aElem = document.createElement('a');
        aElem.download = `copy-${Date.now()}.pdf`;
        aElem.href = URL.createObjectURL(new Blob([buffer]));
        aElem.click();
      }, ignore);
    }
  });
}

window.addEventListener('DOMContentLoaded', run);
