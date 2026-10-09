/**
 * The render service and layer: the settings with no document (and their changes), redraws as
 * `invalidated$`, and one `<epdf-render-layer>` picture per page on a Stage, never handed a
 * revoked URL, leaving out what a layer on the page paints.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EpdfRender, EpdfRenderLayer, RENDER_DEFAULTS, withRender } from '@embedpdf/angular/render';
import { injectPage, paintsPagePart } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { Engine } from '@embedpdf/core';
import { bytesInput, fakeEngine, handleFor, kernelOf, mount, viewerHost } from './fixtures';

const measured = ['clientWidth', 'clientHeight'] as const;
const originals = measured.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  });
});
afterAll(() => {
  measured.forEach((name, index) => {
    const original = originals[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  });
});
afterEach(() => TestBed.resetTestingModule());

describe('EpdfRender', () => {
  it('reads and changes the settings with no document', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withRender({ fullPage: { maxWidth: 320 } })] }),
    );
    const render = fixture.debugElement.injector.get(EpdfRender);
    expect(render.settings().fullPage.maxWidth).toBe(320);
    expect(render.settings().tiles).toEqual(RENDER_DEFAULTS.tiles);
    render.updateSettings({ tiles: false });
    expect(render.settings().tiles).toBe(false);
  });

  it('streams redraws as invalidated$', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        config: { engine: fakeEngine(2).engine },
        features: [withRender()],
      }),
    );
    const render = fixture.debugElement.injector.get(EpdfRender);
    const redraws: number[] = [];
    render.invalidated$.subscribe(({ pages }) => redraws.push(pages.length));
    await kernelOf(fixture).documents.open(bytesInput('a'));
    render.invalidate({ pages: [0] });
    render.invalidate();
    expect(redraws).toEqual([1, 2]);
  });
});

/** A layer that paints the page's annotations itself, as `<epdf-annotation-layer>` does. */
@Component({ selector: 'test-annotation-painter', template: '' })
class AnnotationPainter {
  constructor() {
    const page = injectPage('<test-annotation-painter>');
    paintsPagePart(() => page.ref, 'annotations');
  }
}

describe('<epdf-render-layer>', () => {
  it('leaves out what a layer on the page paints, from the first request', async () => {
    const asked: Record<string, unknown>[] = [];
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, AnnotationPainter],
        config: { engine: recordingEngine(asked) },
        features: [withStage({ zoom: { pageWidth: 100 } }), withRender()],
        template: `
          <epdf-stage>
            <ng-template epdfPage>
              <epdf-render-layer />
              <test-annotation-painter />
            </ng-template>
          </epdf-stage>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(asked.length).toBeGreaterThan(0);
    });
    const parts = asked.map(({ includeAnnotations, includeFormFields }) => [
      includeAnnotations,
      includeFormFields,
    ]);
    expect(parts).toEqual(asked.map(() => [false, true]));
  });

  it('draws one picture on every page of a Stage', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
        config: { engine: fakeEngine(2).engine },
        features: [withStage({ zoom: { pageWidth: 100 } }), withRender()],
        template: `
          <epdf-stage>
            <ng-template epdfPage><epdf-render-layer [annotations]="false" /></ng-template>
          </epdf-stage>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelectorAll('epdf-render-layer img')).toHaveLength(2);
    });
  });

  // A binding applies the URL at the next change detection, and the page's picture can move on
  // before that, revoking the URL: the image would then be handed a revoked URL and lose its
  // picture. Here the page is redrawn while its first picture's URL is being handed out.
  it('never hands an image a revoked URL when the picture moves on before change detection', async () => {
    const revoked = new Set<string>();
    const handedRevoked: string[] = [];
    let render: EpdfRender | undefined;
    const setAttribute = Element.prototype.setAttribute;
    const spy = vi
      .spyOn(Element.prototype, 'setAttribute')
      .mockImplementation(function (this: Element, name: string, value: string) {
        if (name === 'src' && revoked.has(value)) handedRevoked.push(value);
        setAttribute.call(this, name, value);
      });
    try {
      const fixture = await mount(
        viewerHost({
          imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
          config: {
            engine: renderingEngine(
              (url) => {
                if (url === 'blob:picture-1') render?.invalidate();
              },
              (url) => revoked.add(url),
            ),
          },
          features: [withStage({ zoom: { pageWidth: 100 } }), withRender({ tiles: false })],
          template: `
            <epdf-stage>
              <ng-template epdfPage><epdf-render-layer [annotations]="false" /></ng-template>
            </epdf-stage>
          `,
        }),
      );
      render = fixture.debugElement.injector.get(EpdfRender);
      await kernelOf(fixture).documents.open(bytesInput('a'));
      await vi.waitFor(async () => {
        await fixture.whenStable();
        const image = fixture.nativeElement.querySelector('epdf-render-layer img');
        expect(image?.src).toBe('blob:picture-2');
      });
      expect(revoked.has('blob:picture-1')).toBe(true);
      expect(handedRevoked).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

/** A promise with the `abort` / `abortWith` the engine's tasks have. */
function task<T>(value: T) {
  const promise = Promise.resolve(value);
  return Object.assign(promise, { abort: () => {}, abortWith: () => promise });
}

/**
 * An engine whose one page renders at once. `onUrl` hears each picture's URL as it's handed out,
 * `onRevoke` each one let go of.
 */
/** An engine whose pictures record the options they were asked with. */
function recordingEngine(asked: Record<string, unknown>[]) {
  const handle = {
    ...handleFor('a', 2),
    render: { getPolicy: () => Promise.resolve({ kind: 'continuous' }) },
    page: () => ({
      render: {
        image: (options: Record<string, unknown>) => {
          asked.push(options);
          const url = `blob:picture-${asked.length}`;
          return task({ objectUrl: () => task({ url, revoke: () => {} }) });
        },
      },
    }),
  };
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

function renderingEngine(onUrl: (url: string) => void, onRevoke: (url: string) => void) {
  let calls = 0;
  const handle = {
    ...handleFor('a'),
    render: { getPolicy: () => Promise.resolve({ kind: 'continuous' }) },
    page: () => ({
      render: {
        image: () => {
          const url = `blob:picture-${++calls}`;
          return task({
            objectUrl: () => {
              onUrl(url);
              return task({ url, revoke: () => onRevoke(url) });
            },
          });
        },
      },
    }),
  };
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}
