import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import {
  createCapabilityToken,
  EpdfDocumentGate,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { StageCapability } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// The strip is a second view of the document, with its own token and settings.
const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(), // the main view
      withStage({
        id: 'stage-thumbs',
        token: ThumbsToken,
        interaction: false, // a drag doesn't select text or draw
        zoomGestures: false, // a pinch doesn't resize the thumbnails
        zoom: { pageWidth: 96 },
        gap: { px: 12 },
        padding: 10,
        pageFrame: { bottom: 20 }, // room for the page number
        // A wide, short strip (on a phone) lines the thumbnails up in a row.
        responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
      }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './thumbnail-strip.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="reader">
      <epdf-stage #thumbs="epdfStage" [token]="thumbsToken" class="strip">
        <ng-template epdfPage let-page>
          <button
            type="button"
            class="thumb"
            [attr.aria-label]="'Page ' + (page.pageIndex() + 1)"
            [attr.aria-current]="page.pageIndex() === main.currentPageIndex()"
            (click)="main.goToPage(page.ref)"
          >
            <epdf-render-layer />
          </button>
        </ng-template>
        <ng-template epdfPageChrome let-page>
          <span class="number" [style.height.px]="page.frame().bottom">
            {{ page.pageIndex() + 1 }}
          </span>
        </ng-template>
      </epdf-stage>
      <!-- Keep the current page's thumbnail in view as the reader moves. -->
      <epdf-stage #main="epdfStage" class="stage" (pageChange)="thumbs.reveal($event)">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly thumbsToken = ThumbsToken;
}
