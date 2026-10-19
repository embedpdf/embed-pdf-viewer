import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { StageSettings } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// A preset is an object you keep, and apply with updateSettings().
const READING: Partial<StageSettings> = {
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
};
const PRESENTATION: Partial<StageSettings> = {
  arrivalAlign: { x: 'center', y: 'center' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'center', y: 'center' },
};

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
      // Zoomed in, so a page is wider than the view and you can see where it lands.
      withStage({ zoom: { level: 1.6 } }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './presets.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- The settings say which feel is on: pages land centered in a presentation. -->
      @let presentation = stage.settings().arrivalAlign.y === 'center';
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Feel">
          <button
            type="button"
            [attr.aria-pressed]="!presentation"
            (click)="stage.updateSettings(reading)"
          >
            Reading
          </button>
          <button
            type="button"
            [attr.aria-pressed]="presentation"
            (click)="stage.updateSettings(presentationFeel)"
          >
            Presentation
          </button>
        </div>
        <div class="pager">
          <button type="button" class="button" (click)="stage.previousPage()">‹ Previous</button>
          <button type="button" class="button" (click)="stage.nextPage()">Next ›</button>
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
  protected readonly reading = READING;
  protected readonly presentationFeel = PRESENTATION;
}
