import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // Reserve a 26px band below every page: the label lives there, so it never
      // covers the page and keeps its size when you zoom.
      withStage({ pageFrame: { bottom: 26 } }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page-labels.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: loading" class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
      <ng-template epdfPageChrome let-page>
        <div class="page-label" [style.height.px]="page.frame().bottom">
          Page {{ page.pageIndex() + 1 }}
        </div>
      </ng-template>
    </epdf-stage>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
