import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './zoom.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" aria-label="Zoom out" (click)="stage.zoomOut()">
          −
        </button>
        <output class="readout">{{ percent(stage.zoomLevel()) }}%</output>
        <button type="button" class="button" aria-label="Zoom in" (click)="stage.zoomIn()">
          +
        </button>
        <div class="segmented" role="group" aria-label="Fit">
          <button
            type="button"
            [attr.aria-pressed]="stage.zoomMode() === 'automatic'"
            (click)="stage.fitAutomatic()"
          >
            Automatic
          </button>
          <button
            type="button"
            [attr.aria-pressed]="stage.zoomMode() === 'fit-page'"
            (click)="stage.fitPage()"
          >
            Fit page
          </button>
          <button
            type="button"
            [attr.aria-pressed]="stage.zoomMode() === 'fit-width'"
            (click)="stage.fitWidth()"
          >
            Fit width
          </button>
        </div>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}
