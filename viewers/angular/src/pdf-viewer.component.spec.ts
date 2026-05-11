import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import EmbedPDF from '@embedpdf/snippet';
import type { EmbedPdfContainer, PDFViewerConfig, PluginRegistry } from '@embedpdf/snippet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PDFViewer } from './pdf-viewer.component';
import {
  EMBEDPDF_VIEWER_DEFAULT_CONFIG,
  provideEmbedPdfViewerConfig,
  provideEmbedPdfViewerDefaults,
} from './pdf-viewer.config';

vi.mock('@embedpdf/snippet', () => ({
  default: { init: vi.fn() },
}));

const ROOT_DEFAULT_CONFIG = {
  disabledCategories: ['annotation'],
  theme: {
    preference: 'dark',
    light: {
      accent: {
        primary: '#dd0031',
        primaryForeground: '#ffffff',
      },
    },
    dark: {
      accent: {
        primary: '#1f2937',
      },
    },
  },
} satisfies PDFViewerConfig;

const CHILD_DEFAULT_CONFIG = {
  theme: {
    dark: {
      accent: {
        primary: '#ff5c7c',
        primaryForeground: '#17050a',
      },
    },
  },
} satisfies PDFViewerConfig;

@Component({
  imports: [PDFViewer],
  providers: [provideEmbedPdfViewerConfig(ROOT_DEFAULT_CONFIG)],
  template: ` <embedpdf-viewer [config]="config" /> `,
})
class ViewerWithDefaultsHost {
  config: PDFViewerConfig = {
    src: '/provided.pdf',
    theme: {
      preference: 'light',
    },
  };
}

@Component({
  selector: 'test-nested-viewer-defaults',
  imports: [PDFViewer],
  providers: [provideEmbedPdfViewerConfig(CHILD_DEFAULT_CONFIG)],
  template: ` <embedpdf-viewer [config]="config" /> `,
})
class ViewerWithNestedDefaultsChild {
  config: PDFViewerConfig = {
    src: '/nested.pdf',
    theme: {
      preference: 'light',
    },
  };
}

@Component({
  imports: [ViewerWithNestedDefaultsChild],
  providers: [provideEmbedPdfViewerConfig(ROOT_DEFAULT_CONFIG)],
  template: ` <test-nested-viewer-defaults /> `,
})
class ViewerWithNestedDefaultsHost {}

describe('PDFViewer', () => {
  let fixture: ComponentFixture<PDFViewer> | null = null;
  const initSpy = vi.mocked(EmbedPDF.init);

  const createViewerFixture = () => {
    fixture = TestBed.createComponent(PDFViewer);
    return fixture;
  };

  beforeEach(() => {
    initSpy.mockReset();
    TestBed.configureTestingModule({
      imports: [PDFViewer, ViewerWithDefaultsHost, ViewerWithNestedDefaultsHost],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
  });

  it('does not render an extra mount wrapper', () => {
    const fixture = createViewerFixture();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.embedpdf-viewer-container')).toBeNull();
    expect(host.childElementCount).toBe(0);
  });

  it('initializes EmbedPDF with the component host as the target after render', async () => {
    const fixture = createViewerFixture();
    initSpy.mockReturnValue(undefined);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(initSpy).toHaveBeenCalledTimes(1);
    const callArg = initSpy.mock.calls[0]![0];
    expect(callArg.type).toBe('container');
    expect(callArg.target).toBe(fixture.nativeElement);
  });

  it('emits init and ready when the snippet returns a viewer', async () => {
    const fixture = createViewerFixture();
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer;
    (viewer as { registry: Promise<PluginRegistry> }).registry = Promise.resolve({
      token: 'test-registry',
    } as never);
    initSpy.mockReturnValue(viewer);

    const initEvents: unknown[] = [];
    const readyEvents: unknown[] = [];
    fixture.componentInstance.init.subscribe((c) => initEvents.push(c));
    fixture.componentInstance.ready.subscribe((r) => readyEvents.push(r));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(initEvents).toEqual([viewer]);
    expect(readyEvents).toHaveLength(1);
    expect(fixture.componentInstance.container()).toBe(viewer);
    expect(fixture.componentInstance.registry()).toEqual({ token: 'test-registry' });
  });

  it('forwards config changes to the initialized viewer', async () => {
    const fixture = createViewerFixture();
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer;
    (viewer as { registry: Promise<PluginRegistry>; config: PDFViewerConfig }).registry =
      Promise.resolve({ token: 'test-registry' } as never);
    (viewer as { config: PDFViewerConfig }).config = {};
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

    expect(viewer.config).toStrictEqual(nextConfig);
  });

  it('merges provided defaults into the initial viewer config', async () => {
    initSpy.mockReturnValue(undefined);

    const hostFixture = TestBed.createComponent(ViewerWithDefaultsHost);
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy.mock.calls[0]![0]).toMatchObject({
      src: '/provided.pdf',
      disabledCategories: ['annotation'],
      theme: {
        preference: 'light',
        light: {
          accent: {
            primary: '#dd0031',
            primaryForeground: '#ffffff',
          },
        },
        dark: {
          accent: {
            primary: '#1f2937',
          },
        },
      },
    });
  });

  it('exposes EnvironmentProviders via provideEmbedPdfViewerDefaults', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideEmbedPdfViewerDefaults(ROOT_DEFAULT_CONFIG)],
    });

    expect(TestBed.inject(EMBEDPDF_VIEWER_DEFAULT_CONFIG)).toEqual(ROOT_DEFAULT_CONFIG);
  });

  it('merges nested provider defaults with per-component config', async () => {
    initSpy.mockReturnValue(undefined);

    const hostFixture = TestBed.createComponent(ViewerWithNestedDefaultsHost);
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy.mock.calls[0]![0]).toMatchObject({
      src: '/nested.pdf',
      disabledCategories: ['annotation'],
      theme: {
        preference: 'light',
        light: {
          accent: {
            primary: '#dd0031',
            primaryForeground: '#ffffff',
          },
        },
        dark: {
          accent: {
            primary: '#ff5c7c',
            primaryForeground: '#17050a',
          },
        },
      },
    });
  });

  it('forwards merged config changes when defaults are provided', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PDFViewer],
      providers: [provideEmbedPdfViewerConfig(ROOT_DEFAULT_CONFIG)],
    });

    const fixture = createViewerFixture();
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer;
    (viewer as { registry: Promise<PluginRegistry>; config: PDFViewerConfig }).registry =
      Promise.resolve({ token: 'test-registry' } as never);
    (viewer as { config: PDFViewerConfig }).config = {};
    initSpy.mockReturnValue(viewer);

    fixture.componentRef.setInput('config', {
      src: '/provided.pdf',
      theme: {
        preference: 'light',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentRef.setInput('config', {
      src: '/next.pdf',
      theme: {
        preference: 'dark',
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(viewer.config).toMatchObject({
      src: '/next.pdf',
      disabledCategories: ['annotation'],
      theme: {
        preference: 'dark',
        light: {
          accent: {
            primary: '#dd0031',
            primaryForeground: '#ffffff',
          },
        },
        dark: {
          accent: {
            primary: '#1f2937',
          },
        },
      },
    });
  });

  it('does not emit ready after the component is destroyed', async () => {
    const fixture = createViewerFixture();
    let resolveRegistry!: (value: PluginRegistry) => void;
    const registryPromise = new Promise<PluginRegistry>((resolve) => {
      resolveRegistry = resolve;
    });
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer;
    (viewer as { registry: Promise<PluginRegistry> }).registry = registryPromise;
    initSpy.mockReturnValue(viewer);

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
    const fixture = createViewerFixture();
    expect(() => fixture.destroy()).not.toThrow();
    expect(fixture.componentInstance.container()).toBeNull();
    expect(fixture.componentInstance.registry()).toBeNull();
  });

  it('clears the container on destroy', () => {
    const fixture = createViewerFixture();
    initSpy.mockReturnValue(undefined);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.appendChild(globalThis.document.createElement('span'));
    expect(host.childElementCount).toBe(1);

    fixture.destroy();
    expect(host.childElementCount).toBe(0);
    expect(fixture.componentInstance.container()).toBeNull();
    expect(fixture.componentInstance.registry()).toBeNull();
  });

  it('forwards themeChange events emitted by the viewer container', async () => {
    const fixture = createViewerFixture();
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer & {
      registry: Promise<PluginRegistry>;
    };
    (viewer as { registry: Promise<PluginRegistry> }).registry = Promise.resolve({
      token: 'test-registry',
    } as never);
    initSpy.mockReturnValue(viewer);

    const themeChangeEvents: unknown[] = [];
    fixture.componentInstance.themeChange.subscribe((detail) => themeChangeEvents.push(detail));

    fixture.detectChanges();
    await fixture.whenStable();

    const detail = {
      preference: 'dark' as const,
      colorScheme: 'dark' as const,
      theme: { name: 'test-theme' } as never,
    };
    (viewer as unknown as EventTarget).dispatchEvent(new CustomEvent('themechange', { detail }));

    expect(themeChangeEvents).toEqual([detail]);
  });

  it('does not emit themeChange after the component is destroyed', async () => {
    const fixture = createViewerFixture();
    const viewer = globalThis.document.createElement('div') as unknown as EmbedPdfContainer & {
      registry: Promise<PluginRegistry>;
    };
    (viewer as { registry: Promise<PluginRegistry> }).registry = Promise.resolve({
      token: 'test-registry',
    } as never);
    initSpy.mockReturnValue(viewer);

    const themeChangeEvents: unknown[] = [];
    fixture.componentInstance.themeChange.subscribe((detail) => themeChangeEvents.push(detail));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();

    (viewer as unknown as EventTarget).dispatchEvent(
      new CustomEvent('themechange', {
        detail: {
          preference: 'dark',
          colorScheme: 'dark',
          theme: {} as never,
        },
      }),
    );

    expect(themeChangeEvents).toEqual([]);
  });
});
