/**
 * `<epdf-page-view>` takes its page as a ref or an index, shows its fallback template until the
 * page is there, gives the layers between its tags the page's context (which follows `[page]`),
 * keeps `class` on its outer box, and sizes the page by its width before it's turned: a page
 * turned a quarter shows its height across.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { Engine } from '@embedpdf/core';
import { EpdfDocumentScope, injectPage } from '@embedpdf/angular/runtime';
import {
  InteractionToken,
  withInteraction,
  type ToolPointerEvent,
} from '@embedpdf/angular/interaction';
import { EpdfFallback, EpdfPageChrome, EpdfPageView } from '@embedpdf/angular/page-view';
import {
  bytesInput,
  fakeEngine,
  handleFor,
  kernelOf,
  mount,
  pageLayout,
  viewerHost,
} from './fixtures';

/** Shows the page it's drawn on: its object number and its index. */
@Component({
  selector: 'test-page-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ page.ref.objectNumber }}@{{ page.pageIndex() }}`,
})
class PageProbe {
  protected readonly page = injectPage('test-page-probe');
}

/** Shows the document of the page it's drawn on. */
@Component({
  selector: 'test-document-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ page.documentId }}`,
})
class DocumentProbe {
  protected readonly page = injectPage('test-document-probe');
}

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

afterEach(() => TestBed.resetTestingModule());

describe('<epdf-page-view>', () => {
  it('shows a page given by its index or its ref, and the fallback until then', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPageView, EpdfFallback, PageProbe],
        config: { engine: fakeEngine(2).engine },
        template: `
          <epdf-page-view [page]="1" class="by-index">
            <ng-template epdfFallback><p class="waiting">Loading</p></ng-template>
            <test-page-probe />
          </epdf-page-view>
          <epdf-page-view [page]="{ kind: 'objectNumber', objectNumber: 1 }" class="by-ref" [pageFrame]="{ bottom: 20 }">
            <test-page-probe />
          </epdf-page-view>
        `,
      }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.by-index .waiting')).not.toBeNull(); // no document yet
    expect(root.querySelector('.by-index test-page-probe')).toBeNull();

    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    expect(root.querySelector('.waiting')).toBeNull();
    expect(text(root.querySelector('.by-index test-page-probe'))).toBe('2@1');
    expect(text(root.querySelector('.by-ref test-page-probe'))).toBe('1@0');
    // The bands go around the page: 240 wide, 320 tall, and 20 more below.
    const byRef = root.querySelector<HTMLElement>('.by-ref')!;
    expect(byRef.style.width).toBe('240px');
    expect(byRef.style.height).toBe('340px');
  });

  it('follows [page]: the layers inside draw the new page', async () => {
    @Component({
      selector: 'test-picker',
      imports: [EpdfPageView, PageProbe],
      template: `
        <epdf-page-view [page]="index()" [width]="120">
          <test-page-probe />
        </epdf-page-view>
      `,
    })
    class Picker {
      readonly index = signal(0);
    }
    const Host = viewerHost({
      imports: [Picker],
      config: { engine: fakeEngine(3).engine },
      template: '<test-picker />',
    });
    const fixture = await mount(Host);
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('test-page-probe'))).toBe('1@0');

    const picker = fixture.debugElement.children[0]!.componentInstance as Picker;
    picker.index.set(2);
    await fixture.whenStable();
    expect(text(root.querySelector('test-page-probe'))).toBe('3@2');
  });

  it('shows the document [epdfDocumentScope] names, else the active one, unless given one', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPageView, EpdfDocumentScope, DocumentProbe],
        template: `
          <div [epdfDocumentScope]="'b'">
            <epdf-page-view [page]="0" class="scoped"><test-document-probe /></epdf-page-view>
          </div>
          <epdf-page-view [page]="0" class="active"><test-document-probe /></epdf-page-view>
          <epdf-page-view [page]="0" documentId="b" class="given">
            <test-document-probe />
          </epdf-page-view>
        `,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('.scoped test-document-probe'))).toBe('b');
    expect(text(root.querySelector('.active test-document-probe'))).toBe('a');
    expect(text(root.querySelector('.given test-document-probe'))).toBe('b');
  });

  it('draws the chrome template around the page, with the page', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPageView, EpdfPageChrome],
        template: `
          <epdf-page-view [page]="0" [pageFrame]="{ bottom: 20 }">
            <ng-template epdfPageChrome let-page>
              <span class="label">Page {{ page.pageIndex() + 1 }}</span>
            </ng-template>
          </epdf-page-view>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    expect(text((fixture.nativeElement as HTMLElement).querySelector('.label'))).toBe('Page 1');
  });

  it('a page turned a quarter is `width` pixels tall and shows its height across', async () => {
    // A portrait page (600 × 800 points) turned 90°: it shows 800 across, 600 down.
    const turned = { ...pageLayout(1, 0), rotation: 90 as const };
    const handle = handleFor('a');
    const engine = {
      open: () =>
        Promise.resolve({
          ...handle,
          pages: { list: () => Promise.resolve({ pageCount: 1, pages: [turned] }) },
        }),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPageView],
        config: { engine },
        template: `
          <epdf-page-view [page]="{ kind: 'objectNumber', objectNumber: 1 }" [width]="120" class="turned"><span></span></epdf-page-view>
        `,
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await fixture.whenStable();
    const outer = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.turned')!;
    expect(parseFloat(outer.style.width)).toBeCloseTo(160, 5); // 120 × 800 / 600
    expect(parseFloat(outer.style.height)).toBeCloseTo(120, 5);
  });
});

describe('pointer input in a page view', () => {
  it('is the page’s pointer surface when the interaction plugin is registered, below the layers', async () => {
    const withTools = await mount(
      viewerHost({
        imports: [EpdfPageView],
        features: [withInteraction()],
        template: `<epdf-page-view [page]="0"><span class="layer"></span></epdf-page-view>`,
      }),
    );
    await kernelOf(withTools).documents.open(bytesInput('a'));
    await withTools.whenStable();
    const box = (withTools.nativeElement as HTMLElement).querySelector('.layer')!.parentElement!;
    // The surface comes first, so the layers drawn after it sit on top of it.
    expect(box.firstElementChild!.tagName).toBe('EPDF-PAGE-POINTER-SOURCE');
    expect((box.firstElementChild as HTMLElement).style.touchAction).toBe('none');
    expect(box.lastElementChild!.className).toBe('layer');
    TestBed.resetTestingModule();

    const withoutTools = await mount(
      viewerHost({
        imports: [EpdfPageView],
        template: `<epdf-page-view [page]="0"><span class="layer"></span></epdf-page-view>`,
      }),
    );
    await kernelOf(withoutTools).documents.open(bytesInput('a'));
    await withoutTools.whenStable();
    const plain = (withoutTools.nativeElement as HTMLElement).querySelector(
      '.layer',
    )!.parentElement!;
    expect(plain.children).toHaveLength(1);
  });

  it('hands a press to the active tool, as a point on that page, with its cursor', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfPageView],
        features: [withInteraction()],
        template: `<epdf-page-view [page]="0" [width]="300"><span class="layer"></span></epdf-page-view>`,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await fixture.whenStable();
    const downs: ToolPointerEvent[] = [];
    const interaction = kernel.capability(InteractionToken);
    interaction.registerTool({
      id: 'pen',
      cursor: 'crosshair',
      onPointerDown: (event) => {
        downs.push(event);
        return true;
      },
    });
    interaction.activateTool('pen');
    await fixture.whenStable();

    const source = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'epdf-page-pointer-source',
    )!;
    // Over the page, the active tool's cursor shows.
    source.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }));
    await fixture.whenStable();
    expect(source.style.cursor).toBe('crosshair');

    source.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(downs).toHaveLength(1);
    expect(downs[0]!.page.objectNumber).toBe(1);
  });
});
