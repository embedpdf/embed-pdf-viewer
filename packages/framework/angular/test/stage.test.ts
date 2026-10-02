/**
 * `<epdf-stage>` as Angular code uses it: its State table as signals through a template
 * reference, read empty without a document; a second view through `[token]`; its settings;
 * each visible page drawn with the page and chrome templates; `inject(EpdfStage)` inside it;
 * `[(page)]` both ways; `[document]` opening and closing; and its events as streams.
 */
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCapabilityToken } from '@embedpdf/core';
import { injectPage, type EpdfPageContext } from '@embedpdf/angular/runtime';
import {
  DEFAULT_SETTINGS,
  EpdfPageChrome,
  EpdfPageTemplate,
  EpdfScrollbar,
  EpdfStage,
  StageToken,
  withStage,
  type StageCapability,
} from '@embedpdf/angular/stage';
import { bytesInput, fakeEngine, kernelOf, mount, viewerHost } from './fixtures';

const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
const features = [
  withStage({ scrollBehavior: 'instant' }),
  withStage({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', interaction: false }),
];

// happy-dom lays nothing out, so every element measures as a 800 × 600 box: enough for the
// Stage to place pages.
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

const text = (element: HTMLElement) => element.textContent?.replace(/\s+/g, ' ').trim();
const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
};

describe('the Stage’s signals', () => {
  it('read empty with no document, then the view, through a template reference', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage],
        config: { engine: fakeEngine(5).engine },
        features,
        template: `
          <epdf-stage #stage="epdfStage" />
          {{ stage.currentPageIndex() }}/{{ stage.pageCount() }} at {{ stage.zoomLevel() > 0 }}
        `,
      }),
    );
    expect(text(fixture.nativeElement)).toBe('0/0 at true');
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle(fixture);
    expect(text(fixture.nativeElement)).toBe('0/5 at true');
  });

  it('read the view [token] names', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage],
        features,
        template: `
          <epdf-stage #main="epdfStage" />
          <epdf-stage #thumbs="epdfStage" [token]="thumbsToken" />
          {{ main.viewRotation() }} {{ thumbs.viewRotation() }} {{ thumbs.settings().layout }}
        `,
      }),
    );
    (fixture.componentInstance as unknown as { thumbsToken: unknown }).thumbsToken = ThumbsToken;
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await settle(fixture);
    const [main, thumbs] = fixture.debugElement
      .queryAll(By.directive(EpdfStage))
      .map((element) => element.componentInstance as EpdfStage);
    thumbs.setViewRotation(180);
    await settle(fixture);
    expect(main.viewRotation()).toBe(0);
    expect(thumbs.viewRotation()).toBe(180);
    expect(kernel.capability(ThumbsToken).getViewRotation()).toBe(180);
  });

  it('settings() reads the defaults with no document, then the view’s settings as they change', async () => {
    const fixture = await mount(
      viewerHost({ imports: [EpdfStage], features, template: '<epdf-stage />' }),
    );
    const stage = fixture.debugElement.query(By.directive(EpdfStage))
      .componentInstance as EpdfStage;
    expect(stage.settings()).toBe(DEFAULT_SETTINGS);
    expect(() => stage.zoomIn()).toThrow('no document is open');

    await kernelOf(fixture).documents.open(bytesInput('a'));
    stage.updateSettings({ layout: 'horizontal' });
    expect(stage.settings().layout).toBe('horizontal');
    expect(kernelOf(fixture).capability(StageToken).getSettings().layout).toBe('horizontal');
  });
});

describe('the pages', () => {
  it('draw each visible page with the page and chrome templates, and give it its context', async () => {
    const contexts: EpdfPageContext[] = [];
    @Component({ selector: 'test-layer', template: 'layer' })
    class Layer {
      constructor() {
        contexts.push(injectPage());
      }
    }
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfPageTemplate, EpdfPageChrome, Layer],
        config: { engine: fakeEngine(2).engine },
        features: [withStage({ zoom: { pageWidth: 100 } })],
        template: `
          <epdf-stage>
            <ng-template epdfPage let-page><test-layer /></ng-template>
            <ng-template epdfPageChrome let-page>
              <span class="label">{{ page.pageIndex() + 1 }}</span>
            </ng-template>
          </epdf-stage>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle(fixture);
    const labels = [...fixture.nativeElement.querySelectorAll('.label')].map(
      (label) => (label as HTMLElement).textContent,
    );
    expect(labels).toEqual(['1', '2']);
    expect(contexts.map((page) => page.ref.objectNumber)).toEqual([1, 2]);
    expect(contexts[0].documentId).toBe('a');
    expect(contexts[0].transform().contentWidth).toBeGreaterThan(0);
  });

  it('let what’s inside the Stage inject it', async () => {
    let injected: EpdfStage | null = null;
    @Component({ selector: 'test-navigation', template: '' })
    class Navigation {
      constructor() {
        injected = inject(EpdfStage);
      }
    }
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, Navigation],
        features,
        template: '<epdf-stage><test-navigation /></epdf-stage>',
      }),
    );
    expect(injected).toBe(fixture.debugElement.query(By.directive(EpdfStage)).componentInstance);
  });
});

describe('[(page)]', () => {
  it('goes to the parent’s page, and reports the page the view moves to', async () => {
    @Component({
      selector: 'test-reader',
      imports: [EpdfStage],
      template: '<epdf-stage [(page)]="page" />',
    })
    class Reader {
      readonly page = signal(2);
    }
    const fixture = await mount(
      viewerHost({
        imports: [Reader],
        config: { engine: fakeEngine(6).engine },
        features,
        template: '<test-reader />',
      }),
    );
    const reader = fixture.debugElement.query(By.directive(Reader)).componentInstance as Reader;
    const stage = fixture.debugElement.query(By.directive(EpdfStage))
      .componentInstance as EpdfStage;
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(stage.currentPageIndex()).toBe(2);
    });

    stage.goToPage(4);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(reader.page()).toBe(4);
    });

    reader.page.set(1);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(stage.currentPageIndex()).toBe(1);
    });
  });

  it('pageChanged$ streams every page change', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage],
        config: { engine: fakeEngine(6).engine },
        features,
        template: '<epdf-stage />',
      }),
    );
    const stage = fixture.debugElement.query(By.directive(EpdfStage))
      .componentInstance as EpdfStage;
    const pages: number[] = [];
    stage.pageChanged$.subscribe(({ pageIndex }) => pages.push(pageIndex));
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle(fixture);
    stage.goToPage(3);
    await vi.waitFor(() => expect(pages).toContain(3));
  });
});

describe('[document]', () => {
  it('opens the document for the Stage, and closes it when the value changes', async () => {
    @Component({
      selector: 'test-contract',
      imports: [EpdfStage],
      template: '<epdf-stage [document]="source()" />',
    })
    class Contract {
      readonly source = signal(bytesInput('first'));
    }
    const fixture = await mount(
      viewerHost({ imports: [Contract], features, template: '<test-contract />' }),
    );
    const kernel = kernelOf(fixture);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(kernel.documents.get('first')?.status).toBe('ready');
    });

    const contract = fixture.debugElement.query(By.directive(Contract))
      .componentInstance as Contract;
    contract.source.set(bytesInput('second'));
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(kernel.documents.list().map((document) => document.id)).toEqual(['second']);
    });
    const stage = fixture.debugElement.query(By.directive(EpdfStage))
      .componentInstance as EpdfStage;
    expect(stage.documentScope.id()).toBe('second');
  });
});

describe('<epdf-scrollbar>', () => {
  it('is a track and thumb for the Stage it’s in, shown while there is something to scroll', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfScrollbar],
        config: { engine: fakeEngine(20).engine },
        features,
        template: `
          <epdf-stage>
            <epdf-scrollbar axis="y" class="bar" thumbClass="thumb" />
          </epdf-stage>
        `,
      }),
    );
    const bar = fixture.nativeElement.querySelector('.bar') as HTMLElement;
    expect(bar.style.display).toBe('none');
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(bar.style.display).toBe('block');
    });
    expect(bar.getAttribute('role')).toBe('scrollbar');
    expect(bar.getAttribute('data-axis')).toBe('y');
    expect(bar.querySelector('.thumb')).not.toBeNull();
  });

  it('outside a Stage is EPDF-104', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      mount(
        viewerHost({ imports: [EpdfScrollbar], features, template: '<epdf-scrollbar axis="y" />' }),
      ),
    ).rejects.toThrow('EPDF-104');
    quiet.mockRestore();
  });
});
