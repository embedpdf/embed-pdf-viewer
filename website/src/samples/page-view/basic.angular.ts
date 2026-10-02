import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A card that shows one page, like a preview next to a search result or a comment.
@Component({
  selector: 'demo-page-card',
  imports: [EpdfPageView, EpdfRenderLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="card">
      <epdf-page-view [page]="index()" [width]="220" class="page">
        <epdf-render-layer />
      </epdf-page-view>
      <figcaption class="caption">
        <strong class="title">Page {{ page()?.label ?? index() + 1 }}</strong>
        @if (page(); as page) {
          <span class="detail">
            {{ round(page.size.width) }} × {{ round(page.size.height) }} points
          </span>
        }
        <span class="pager">
          <button
            type="button"
            class="button"
            [disabled]="index() === 0"
            (click)="index.set(index() - 1)"
          >
            ‹ Previous
          </button>
          <button
            type="button"
            class="button"
            [disabled]="index() >= pages().length - 1"
            (click)="index.set(index() + 1)"
          >
            Next ›
          </button>
        </span>
      </figcaption>
    </figure>
  `,
})
export class PageCard {
  protected readonly pages = inject(EpdfDocument).pages;
  protected readonly index = signal(0);
  protected readonly page = computed(() => this.pages()[this.index()]);
  protected readonly round = Math.round;
}

// No Stage: a page on its own needs only the render plugin.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PageCard],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-page-card *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
