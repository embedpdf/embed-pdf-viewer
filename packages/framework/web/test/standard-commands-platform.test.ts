import { afterEach, describe, expect, it, vi } from 'vitest';

import { copySelection } from '../src/clipboard';
import { standardCommandsBrowser } from '../src/standard-commands-platform';

afterEach(() => vi.unstubAllGlobals());

describe('standardCommandsBrowser', () => {
  it('copies with the shared clipboard binding and prints with the browser dialog', () => {
    expect(standardCommandsBrowser.copySelection).toBe(copySelection);
    const print = vi.fn();
    vi.stubGlobal('window', { print });
    standardCommandsBrowser.print();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('hands the document over as a PDF download', () => {
    const anchors: Array<{ download: string; click(): void }> = [];
    vi.stubGlobal('document', {
      body: { appendChild: () => undefined },
      createElement: () => {
        const anchor = {
          href: '',
          download: '',
          style: {},
          click: vi.fn(),
          remove: () => undefined,
        };
        anchors.push(anchor);
        return anchor;
      },
    });
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
    standardCommandsBrowser.saveFile(new Uint8Array([37, 80, 68, 70]), 'report.pdf');
    expect((created.mock.calls[0]![0] as Blob).type).toBe('application/pdf');
    expect(anchors[0]!.download).toBe('report.pdf');
    expect(anchors[0]!.click).toHaveBeenCalled();
    created.mockRestore();
  });
});
