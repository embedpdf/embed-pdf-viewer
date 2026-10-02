import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import {
  createCapabilityToken,
  EpdfDocumentGate,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { StageCapability } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// A second view of the same document: its own id and token, its own zoom and layout.
const OverviewToken = createCapabilityToken<StageCapability>('stage-overview');

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-zoom-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zoom-bar">
      <span class="caption">{{ label() }}</span>
      <button type="button" class="button" aria-label="Zoom out" (click)="stage().zoomOut()">
        −
      </button>
      <output class="readout">{{ percent(stage().zoomLevel()) }}%</output>
      <button type="button" class="button" aria-label="Zoom in" (click)="stage().zoomIn()">
        +
      </button>
    </div>
  `,
})
export class ZoomBar {
  readonly label = input.required<string>();
  readonly stage = input.required<EpdfStage>();

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, ZoomBar],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(), // the main view
      withStage({
        id: 'stage-overview',
        token: OverviewToken,
        layout: 'grid',
        columns: 'auto',
        zoom: { pageWidth: 72 },
        gap: { px: 10 },
        padding: 10,
        interaction: false, // a drag only scrolls it
        // A wide, short box (a phone) lines the pages up in one row.
        responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
      }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './two-views.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="views">
      <section class="view overview">
        <demo-zoom-bar label="Overview" [stage]="overview" />
        <epdf-stage #overview="epdfStage" [token]="overviewToken" class="stage">
          <ng-template epdfPage let-page>
            <button
              type="button"
              class="page-button"
              [attr.aria-label]="'Go to page ' + (page.pageIndex() + 1)"
              [attr.aria-current]="page.pageIndex() === main.currentPageIndex()"
              (click)="main.goToPage(page.ref)"
            >
              <epdf-render-layer />
            </button>
          </ng-template>
        </epdf-stage>
      </section>
      <section class="view main">
        <demo-zoom-bar label="Main view" [stage]="main" />
        <epdf-stage #main="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
          </ng-template>
        </epdf-stage>
      </section>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly overviewToken = OverviewToken;
}
