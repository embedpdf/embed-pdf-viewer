// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserPrinter, printSheetsStyle } from '../src/printer';

const sheet = (widthPt: number, heightPt: number) => ({
  image: new Blob(['png'], { type: 'image/png' }),
  widthPt,
  heightPt,
});

/** Object URLs the test can count, made and revoked. */
function objectUrls() {
  const made: string[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:sheet-${made.length}`;
    made.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
  return { made, revoked };
}

/** Pictures that decode at once, as a loaded image does. */
function decodedImages() {
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue(undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('printSheetsStyle', () => {
  it('names one page per page size, and puts each sheet on the page of its size', () => {
    const { css, sizes } = printSheetsStyle([sheet(595, 842), sheet(842, 595), sheet(595, 842)]);
    expect(css).toContain('@page epdf-sheet-0 { size: 595pt 842pt; margin: 0; }');
    expect(css).toContain('.epdf-sheet-0 { page: epdf-sheet-0; width: 595pt; height: 842pt; }');
    expect(css).toContain('@page epdf-sheet-1 { size: 842pt 595pt; margin: 0; }');
    expect(css).not.toContain('epdf-sheet-2');
    expect(sizes).toEqual(['epdf-sheet-0', 'epdf-sheet-1', 'epdf-sheet-0']);
  });

  it('caps a sheet by the page it prints on, never by the screen', () => {
    const { css } = printSheetsStyle([sheet(595, 842)]);
    expect(css).toContain('max-width: 100%; max-height: 100%;');
    // Safari resolves viewport units against the screen while it prints: on a phone, a sheet
    // capped at 100vw would print at the phone's width.
    expect(css).not.toMatch(/\d(?:vw|vh|vmin|vmax)\b/);
  });
});

describe('browserPrinter on iOS', () => {
  const iPhone = () =>
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });

  it('prints the sheets from the page itself, named for the document, and cleans up', async () => {
    iPhone();
    const { made, revoked } = objectUrls();
    decodedImages();
    document.title = 'My app';
    const titles: string[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      titles.push(document.title);
      window.dispatchEvent(new Event('afterprint'));
    });

    const staged = await browserPrinter().stage([sheet(595, 842), sheet(595, 842)], {
      name: 'Contract',
    });
    const root = document.body.querySelector('[data-epdf-print]');
    expect(
      Array.from(root?.querySelectorAll('.epdf-print-sheet') ?? []).map((element) => [
        element.className,
        element.querySelector('img')?.getAttribute('src'),
      ]),
    ).toEqual([
      ['epdf-print-sheet epdf-sheet-0', 'blob:sheet-0'],
      ['epdf-print-sheet epdf-sheet-0', 'blob:sheet-1'],
    ]);
    expect(document.head.querySelector('style')?.textContent).toContain(
      'body > :not([data-epdf-print]) { display: none !important; }',
    );

    await staged.print();
    expect(titles).toEqual(['Contract']);
    expect(document.title).toBe('My app');

    staged.dispose();
    expect(document.body.querySelector('[data-epdf-print]')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
    expect(revoked).toEqual(made);
  });

  it('a signal that fires while the pictures decode removes everything', async () => {
    iPhone();
    const { made, revoked } = objectUrls();
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockReturnValue(new Promise(() => {}));
    const cancel = new AbortController();
    const staging = browserPrinter().stage([sheet(595, 842)], {
      name: 'Contract',
      signal: cancel.signal,
    });
    cancel.abort(new Error('closed'));
    await expect(staging).rejects.toThrow('closed');
    expect(document.body.querySelector('[data-epdf-print]')).toBeNull();
    expect(revoked).toEqual(made);
  });
});

describe('browserPrinter on a desktop browser', () => {
  it('prints the sheets from a hidden frame of their own', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/146',
      maxTouchPoints: 0,
    });
    const { made, revoked } = objectUrls();
    decodedImages();
    const staging = browserPrinter().stage([sheet(595, 842)], { name: 'Contract <draft>' });
    const frame = document.body.querySelector('iframe');
    expect(frame).not.toBeNull();
    // Nothing of the job is markup: its name and sheets go in as text and elements.
    expect(frame!.srcdoc).not.toContain('Contract');
    frame!.dispatchEvent(new Event('load'));
    const staged = await staging;
    const frameDocument = frame!.contentDocument!;
    expect(frameDocument.title).toBe('Contract <draft>');
    expect(frameDocument.querySelector('.epdf-sheet-0 img')?.getAttribute('src')).toBe(
      'blob:sheet-0',
    );

    // happy-dom's frame window has no print(): the test gives it one.
    const view = frame!.contentWindow!;
    const print = vi.fn(() => void view.dispatchEvent(new Event('afterprint')));
    Object.assign(view, { print, focus: () => {} });
    await staged.print();
    expect(print).toHaveBeenCalledTimes(1);

    staged.dispose();
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(revoked).toEqual(made);
  });
});
