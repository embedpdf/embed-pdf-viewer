/**
 * The browser's print dialog, for the kernel: `createKernel({ printer: browserPrinter() })`.
 * A print is one sheet per page: the page's picture on a sheet of the page's own size
 * (`@page`), shrunk to fit when the browser prints on other paper. A desktop browser prints the
 * sheets from a hidden frame. iOS prints a frame as a picture of the page around it, so there
 * the sheets print from the page itself, hidden on screen. Structurally `HostPrinter` from
 * `@embedpdf/core`, declared here so this package stays dependency-free.
 */

/** Structural twin of `PrintSheet` (`@embedpdf/core`). */
export interface WebPrintSheet {
  readonly image: Blob;
  readonly widthPt: number;
  readonly heightPt: number;
}

/** Structural twin of `StagedPrint` (`@embedpdf/core`). */
export interface WebStagedPrint {
  print(): Promise<void>;
  dispose(): void;
}

/** Structural twin of `HostPrinter` (`@embedpdf/core`). */
export interface WebPrinter {
  stage(
    sheets: readonly WebPrintSheet[],
    options: { readonly name: string; readonly signal?: AbortSignal },
  ): Promise<WebStagedPrint>;
}

/** The attribute that marks the sheets printed from the page itself. */
const PRINT_ROOT = 'data-epdf-print';

/** The browser's printer. */
export function browserPrinter(): WebPrinter {
  return {
    async stage(sheets, { name, signal }) {
      const urls = sheets.map((sheet) => URL.createObjectURL(sheet.image));
      const revoke = () => urls.forEach((url) => URL.revokeObjectURL(url));
      try {
        return printsFramesAsPictures()
          ? await stageInPage(sheets, urls, name, revoke, signal)
          : await stageInFrame(sheets, urls, name, revoke, signal);
      } catch (error) {
        revoke();
        throw error;
      }
    },
  };
}

/**
 * How the sheets print: one named `@page` per page size, and a class per size that puts a sheet
 * on that page, its picture fitted inside. A browser that prints on other paper keeps each sheet
 * on one page: a sheet is never taller or wider than the page it prints on. That cap is a
 * percentage of the page (`html` and `body` are the page's height): Safari resolves `vw` and
 * `vh` against the screen even when it prints, so on a phone they would shrink every sheet to
 * the phone's width. `sizes` is each sheet's class.
 */
export function printSheetsStyle(sheets: readonly WebPrintSheet[]): {
  css: string;
  sizes: string[];
} {
  const named: WebPrintSheet[] = [];
  const sizes = sheets.map((sheet) => {
    const index = named.findIndex(
      (other) => other.widthPt === sheet.widthPt && other.heightPt === sheet.heightPt,
    );
    return `epdf-sheet-${index >= 0 ? index : named.push(sheet) - 1}`;
  });
  const css = [
    '@page { margin: 0; }',
    ...named.flatMap(({ widthPt, heightPt }, index) => [
      `@page epdf-sheet-${index} { size: ${widthPt}pt ${heightPt}pt; margin: 0; }`,
      `.epdf-sheet-${index} { page: epdf-sheet-${index}; width: ${widthPt}pt; height: ${heightPt}pt; }`,
    ]),
    '.epdf-print-sheet { break-after: page; break-inside: avoid; max-width: 100%; max-height: 100%; overflow: hidden; }',
    '.epdf-print-sheet:last-child { break-after: auto; }',
    '.epdf-print-sheet img { display: block; width: 100%; height: 100%; object-fit: contain; }',
  ].join('\n');
  return { css, sizes };
}

/** The sheets, made in `owner` (the frame's document or the page's): one per page, its picture inside. */
function sheetElements(
  owner: Document,
  urls: readonly string[],
  sizes: readonly string[],
): HTMLElement[] {
  return urls.map((url, index) => {
    const sheet = owner.createElement('div');
    sheet.className = `epdf-print-sheet ${sizes[index]}`;
    const image = owner.createElement('img');
    image.alt = '';
    image.src = url;
    sheet.append(image);
    return sheet;
  });
}

/** A frame's document before the sheets go in: nothing of the print job's own is in it. */
const FRAME_DOCUMENT =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

/** The sheets in a hidden frame of their own, so nothing of the host page prints with them. */
async function stageInFrame(
  sheets: readonly WebPrintSheet[],
  urls: readonly string[],
  name: string,
  revoke: () => void,
  signal: AbortSignal | undefined,
): Promise<WebStagedPrint> {
  const { css, sizes } = printSheetsStyle(sheets);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Laid out, but out of sight: a frame that is not laid out may never load.
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  frame.srcdoc = FRAME_DOCUMENT;
  const loaded = untilEvent(frame, 'load', signal);
  document.body.appendChild(frame);
  try {
    await loaded;
    const view = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!view || !frameDocument) throw new Error('the print frame did not load');
    // The print job's name is the frame's title.
    frameDocument.title = name;
    const style = frameDocument.createElement('style');
    style.textContent = `html, body { margin: 0; padding: 0; height: 100%; }\n${css}`;
    frameDocument.head.append(style);
    frameDocument.body.append(...sheetElements(frameDocument, urls, sizes));
    await decodeAll(Array.from(frameDocument.querySelectorAll('img')), signal);
    return {
      print: () => printFrom(view),
      dispose: () => {
        frame.remove();
        revoke();
      },
    };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

/**
 * The sheets in the page itself, shown only when it prints, and everything else hidden then.
 * While it prints, `html` and `body` are plain blocks the page's height, whatever the host page
 * makes them (an app often keeps its body to the window, which would clip the sheets after the
 * first). The page's title is the print job's name while it prints.
 */
async function stageInPage(
  sheets: readonly WebPrintSheet[],
  urls: readonly string[],
  name: string,
  revoke: () => void,
  signal: AbortSignal | undefined,
): Promise<WebStagedPrint> {
  const { css, sizes } = printSheetsStyle(sheets);
  const style = document.createElement('style');
  style.textContent =
    `${css}\n@media screen { [${PRINT_ROOT}] { display: none !important; } }` +
    `\n@media print {` +
    ` html, body { display: block !important; height: 100% !important; margin: 0 !important;` +
    ` padding: 0 !important; overflow: visible !important; }` +
    ` body > :not([${PRINT_ROOT}]) { display: none !important; }` +
    ` [${PRINT_ROOT}] { height: 100%; } }`;
  const root = document.createElement('div');
  root.setAttribute(PRINT_ROOT, '');
  root.append(...sheetElements(document, urls, sizes));
  document.head.appendChild(style);
  document.body.appendChild(root);
  const remove = () => {
    root.remove();
    style.remove();
  };
  try {
    await decodeAll(Array.from(root.querySelectorAll('img')), signal);
  } catch (error) {
    remove();
    throw error;
  }
  return {
    async print() {
      const title = document.title;
      document.title = name;
      try {
        await printFrom(window);
      } finally {
        document.title = title;
      }
    },
    dispose: () => {
      remove();
      revoke();
    },
  };
}

/** Open `view`'s print dialog; resolves when the browser says printing finished. */
function printFrom(view: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    view.addEventListener('afterprint', () => resolve(), { once: true });
    try {
      view.focus();
      view.print();
    } catch (error) {
      reject(error);
    }
  });
}

/** Wait until every picture is decoded, so the dialog never shows an empty sheet. */
async function decodeAll(images: readonly HTMLImageElement[], signal: AbortSignal | undefined) {
  await untilSettled(Promise.all(images.map((image) => image.decode())), signal);
}

function untilEvent(target: EventTarget, type: string, signal: AbortSignal | undefined) {
  return untilSettled(
    new Promise<void>((resolve) => target.addEventListener(type, () => resolve(), { once: true })),
    signal,
  );
}

/** `work`, or the signal's reason as soon as it aborts. */
function untilSettled<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Whether this browser prints a frame as a picture of the page around it: every browser on
 * iOS and iPadOS (all use Safari's engine; iPadOS presents itself as a Mac with touch).
 */
function printsFramesAsPictures(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}
