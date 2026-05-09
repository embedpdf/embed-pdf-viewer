import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmbedPDF from '@embedpdf/snippet';
import type {
  EmbedPdfContainer,
  PDFViewerConfig,
  PluginRegistry,
} from '@embedpdf/snippet';
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

  it('does not render an extra mount wrapper', () => {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.embedpdf-viewer-container')).toBeNull();
    expect(host.childElementCount).toBe(0);
  });

  it('initializes EmbedPDF with the component host as the target after render', async () => {
    initSpy.mockReturnValue(undefined);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(initSpy).toHaveBeenCalledTimes(1);
    const callArg = initSpy.mock.calls[0]![0];
    expect(callArg.type).toBe('container');
    expect(callArg.target).toBe(fixture.nativeElement);
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
    await fixture.whenStable();

    expect(initEvents).toEqual([viewer]);
    expect(readyEvents).toHaveLength(1);
    expect(fixture.componentInstance.container).toBe(viewer);
  });

  it('forwards config changes to the initialized viewer', async () => {
    const viewer = {
      registry: Promise.resolve({ token: 'test-registry' } as never),
      config: {},
    } as unknown as EmbedPdfContainer;
    const initialConfig = { src: '/initial.pdf' } satisfies PDFViewerConfig;
    const nextConfig = { src: '/next.pdf' } satisfies PDFViewerConfig;

    initSpy.mockReturnValue(viewer);
    fixture.componentRef.setInput('config', initialConfig);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(initSpy.mock.calls[0]![0].src).toBe('/initial.pdf');

    fixture.componentRef.setInput('config', nextConfig);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(viewer.config).toBe(nextConfig);
  });

  it('does not emit ready after the component is destroyed', async () => {
    let resolveRegistry!: (registry: PluginRegistry) => void;
    const registry = new Promise<PluginRegistry>((resolve) => {
      resolveRegistry = resolve;
    });
    const viewer = { registry };
    initSpy.mockReturnValue(viewer as never);

    const readyEvents: unknown[] = [];
    fixture.componentInstance.ready.subscribe((value) => readyEvents.push(value));

    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();
    resolveRegistry({ token: 'late-registry' } as never);
    await Promise.resolve();

    expect(readyEvents).toEqual([]);
  });

  it('can be destroyed before the view query resolves', () => {
    expect(() => fixture.destroy()).not.toThrow();
    expect(fixture.componentInstance.container).toBeNull();
  });

  it('clears the container on destroy', () => {
    initSpy.mockReturnValue(undefined);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.appendChild(document.createElement('span'));
    expect(host.childElementCount).toBe(1);

    fixture.destroy();
    expect(host.childElementCount).toBe(0);
    expect(fixture.componentInstance.container).toBeNull();
  });
});
