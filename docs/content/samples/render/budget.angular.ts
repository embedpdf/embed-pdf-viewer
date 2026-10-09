import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRender, EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const BUDGETS = [320, 640, 1280];

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // Zoomed in, where the budget and the tiles show.
      withStage({ zoom: { level: 2 } }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './budget.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <span class="label">Budget</span>
        <div class="segmented" role="group" aria-label="Whole-page budget">
          @for (width of budgets; track width) {
            <button
              type="button"
              [attr.aria-pressed]="width === maxWidth()"
              (click)="render.updateSettings({ fullPage: { maxWidth: width } })"
            >
              {{ width }} px
            </button>
          }
        </div>
        <span class="label">Tiles</span>
        <div class="segmented" role="group" aria-label="Tiles">
          <button
            type="button"
            [attr.aria-pressed]="tiles()"
            (click)="render.updateSettings({ tiles: { size: 512 } })"
          >
            On
          </button>
          <button
            type="button"
            [attr.aria-pressed]="!tiles()"
            (click)="render.updateSettings({ tiles: false })"
          >
            Off
          </button>
        </div>
        <div class="zoom">
          <button type="button" class="button" aria-label="Zoom out" (click)="stage.zoomOut()">
            −
          </button>
          <output class="readout">{{ percent(stage.zoomLevel()) }}%</output>
          <button type="button" class="button" aria-label="Zoom in" (click)="stage.zoomIn()">
            +
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
  protected readonly render = inject(EpdfRender);
  protected readonly budgets = BUDGETS;
  protected readonly maxWidth = computed(() => this.render.settings().fullPage.maxWidth);
  protected readonly tiles = computed(() => this.render.settings().tiles !== false);

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}
