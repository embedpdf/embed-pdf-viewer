import { TestBed } from '@angular/core/testing';
import EmbedPDF from '@embedpdf/snippet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PDFViewer } from './pdf-viewer.component';

// Verifies the AOT-compiled PDFViewer component boots in real Chromium with
// styles applied and the snippet `init` invoked against the host element.
// Catches Vite + Analog + browser-mode config breakage that jsdom can't see.

vi.mock('@embedpdf/snippet', () => ({
  default: { init: vi.fn() },
}));

describe('PDFViewer browser smoke', () => {
  const initSpy = vi.mocked(EmbedPDF.init);

  beforeEach(() => {
    initSpy.mockReset();
    initSpy.mockReturnValue(undefined);
    TestBed.configureTestingModule({ imports: [PDFViewer] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('mounts in real chromium and invokes snippet.init against the host', async () => {
    const fixture = TestBed.createComponent(PDFViewer);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(getComputedStyle(host).display).toBe('block');
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy.mock.calls[0]![0].target).toBe(host);
  });
});
