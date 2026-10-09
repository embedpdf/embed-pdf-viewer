import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { Gap } from '@embedpdf/angular/stage';
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
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // No responsive rules, so the padding you set applies at every width.
      withStage({ padding: 32, gap: { px: 12 }, responsive: [] }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './spacing.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      @let gap = stage.settings().gap;
      <div class="toolbar">
        <label class="label">
          Padding
          <input
            #padding
            class="range"
            type="range"
            min="0"
            max="64"
            [value]="stage.settings().padding"
            (input)="stage.updateSettings({ padding: +padding.value })"
          />
          <output class="value">{{ stage.settings().padding }}</output>
        </label>
        <label class="label">
          Gap
          <input
            #size
            class="range"
            type="range"
            min="0"
            max="64"
            [value]="gapSize(gap)"
            (input)="
              stage.updateSettings({ gap: onScreen(gap) ? { px: +size.value } : +size.value })
            "
          />
          <output class="value">{{ gapSize(gap) }}</output>
        </label>
        <div class="segmented" role="group" aria-label="Gap unit">
          <button
            type="button"
            [attr.aria-pressed]="onScreen(gap)"
            (click)="stage.updateSettings({ gap: { px: gapSize(gap) } })"
          >
            Screen pixels
          </button>
          <button
            type="button"
            [attr.aria-pressed]="!onScreen(gap)"
            (click)="stage.updateSettings({ gap: gapSize(gap) })"
          >
            Grows with zoom
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
  // A number grows with the zoom; { px } stays the same on screen.
  protected onScreen(gap: Gap): boolean {
    return typeof gap !== 'number';
  }

  protected gapSize(gap: Gap): number {
    return typeof gap === 'number' ? gap : gap.px;
  }

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}
