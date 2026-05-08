import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedPDF from '@embedpdf/snippet';
import { PDFViewer } from './pdf-viewer.component';

vi.mock('@embedpdf/snippet', () => ({
  default: { init: vi.fn() },
}));

describe('PDFViewer', () => {
  let fixture: ComponentFixture<PDFViewer>;
  const initSpy = vi.mocked(EmbedPDF.init);

  beforeEach(() => {
    initSpy.mockReset();
    TestBed.configureTestingModule({ imports: [PDFViewer] });
    fixture = TestBed.createComponent(PDFViewer);
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('renders the host with a container div', () => {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const inner = host.querySelector('div');
    expect(inner).not.toBeNull();
  });

  it('initializes EmbedPDF with the host div as the target after view init', () => {
    initSpy.mockReturnValue(null);
    fixture.detectChanges();
    expect(initSpy).toHaveBeenCalledTimes(1);
    const callArg = initSpy.mock.calls[0]![0];
    expect(callArg.type).toBe('container');
    expect(callArg.target).toBeInstanceOf(HTMLDivElement);
  });

  it('emits init and ready when the snippet returns a viewer', async () => {
    const viewer = {
      registry: Promise.resolve({ token: 'test-registry' } as never),
    };
    initSpy.mockReturnValue(viewer as never);

    const initEvents: unknown[] = [];
    const readyEvents: unknown[] = [];
    fixture.componentInstance.init.subscribe((c) => initEvents.push(c));
    fixture.componentInstance.ready.subscribe((r) => readyEvents.push(r));

    fixture.detectChanges();

    expect(initEvents).toEqual([viewer]);
    await fixture.whenStable();
    expect(readyEvents).toHaveLength(1);
    expect(fixture.componentInstance.container).toBe(viewer);
  });

  it('clears the container on destroy', () => {
    initSpy.mockReturnValue(null);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const inner = host.querySelector('div')!;
    inner.appendChild(document.createElement('span'));
    expect(inner.childElementCount).toBe(1);

    fixture.destroy();
    expect(inner.childElementCount).toBe(0);
    expect(fixture.componentInstance.container).toBeNull();
  });
});
